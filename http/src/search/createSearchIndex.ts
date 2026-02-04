import {
  count,
  create,
  insert,
  insertMultiple,
  load,
  type Orama,
  type RawData,
  remove,
  save,
  search,
} from "@orama/orama";
import type { NodeType } from "@ts-graph/shared";
import type {
  SearchDocument,
  SearchMode,
  SearchOptions,
  SearchResult,
} from "./SearchTypes.js";
import { splitCamelCase } from "./splitCamelCase.js";

/**
 * Search index wrapper with convenience methods.
 */
export interface SearchIndexWrapper {
  /** Add a single document to the index */
  add(doc: SearchDocument): Promise<void>;
  /** Add multiple documents in batch */
  addBatch(docs: SearchDocument[]): Promise<void>;
  /** Remove a document by ID */
  remove(id: string): Promise<void>;
  /** Remove all documents for a file */
  removeByFile(filePath: string): Promise<void>;
  /** Search for symbols */
  search(query: string, options?: SearchOptions): Promise<SearchResult[]>;
  /** Export index data for programmatic restore */
  export(): Promise<RawData>;
  /** Get document count */
  count(): Promise<number>;
  /** Check if index supports vector search */
  readonly supportsVectors: boolean;
}

/**
 * Options for creating a search index.
 */
export interface SearchIndexOptions {
  /** Vector dimensions (e.g., 384, 768, 1024). Required for hybrid search. */
  vectorDimensions?: number;
}

/**
 * Preprocess symbol name for BM25 indexing.
 * Combines split identifier with original for better matching.
 *
 * @example
 * preprocessForBM25('validateCart') // 'validate Cart validateCart'
 */
export const preprocessForBM25 = (symbol: string): string => {
  const split = splitCamelCase(symbol);
  return split === symbol ? symbol : `${split} ${symbol}`;
};

// Type for Orama index without vectors
type TextOnlySchema = {
  id: "string";
  symbol: "string";
  file: "string";
  nodeType: "string";
  content: "string";
};

// Type for Orama index with vectors
type VectorSchema = TextOnlySchema & {
  embedding: `vector[${number}]`;
};

type TextOnlyIndex = Orama<TextOnlySchema>;
type VectorIndex = Orama<VectorSchema>;

/**
 * Build the search wrapper methods.
 */
const buildWrapper = <T extends TextOnlyIndex | VectorIndex>(
  db: T,
  docsByFile: Map<string, Set<string>>,
  supportsVectors: boolean,
): SearchIndexWrapper => {
  const trackDoc = (doc: SearchDocument) => {
    const ids = docsByFile.get(doc.file) ?? new Set();
    ids.add(doc.id);
    docsByFile.set(doc.file, ids);
  };

  return {
    get supportsVectors() {
      return supportsVectors;
    },

    async add(doc: SearchDocument): Promise<void> {
      const baseDoc = {
        id: doc.id,
        symbol: doc.symbol,
        file: doc.file,
        nodeType: doc.nodeType,
        content: `${preprocessForBM25(doc.symbol)} ${doc.content}`,
      };

      if (supportsVectors && doc.embedding) {
        await insert(db as VectorIndex, {
          ...baseDoc,
          embedding: Array.from(doc.embedding),
        });
      } else {
        await insert(db as TextOnlyIndex, baseDoc);
      }
      trackDoc(doc);
    },

    async addBatch(docs: SearchDocument[]): Promise<void> {
      if (supportsVectors) {
        // Documents without embeddings are skipped (can't insert 0-dim vectors)
        const docsWithEmbeddings = docs.filter(
          (doc) => doc.embedding && doc.embedding.length > 0,
        );
        if (docsWithEmbeddings.length > 0) {
          const prepared = docsWithEmbeddings.map((doc) => ({
            id: doc.id,
            symbol: doc.symbol,
            file: doc.file,
            nodeType: doc.nodeType,
            content: `${preprocessForBM25(doc.symbol)} ${doc.content}`,
            // biome-ignore lint/style/noNonNullAssertion: filtered above
            embedding: Array.from(doc.embedding!),
          }));
          await insertMultiple(db as VectorIndex, prepared);
        }
      } else {
        const prepared = docs.map((doc) => ({
          id: doc.id,
          symbol: doc.symbol,
          file: doc.file,
          nodeType: doc.nodeType,
          content: `${preprocessForBM25(doc.symbol)} ${doc.content}`,
        }));
        await insertMultiple(db as TextOnlyIndex, prepared);
      }
      for (const doc of docs) {
        trackDoc(doc);
      }
    },

    async remove(id: string): Promise<void> {
      await remove(db, id);
    },

    async removeByFile(filePath: string): Promise<void> {
      const ids = docsByFile.get(filePath);
      if (ids) {
        for (const id of ids) {
          await remove(db, id);
        }
        docsByFile.delete(filePath);
      }
    },

    async search(
      query: string,
      options?: SearchOptions,
    ): Promise<SearchResult[]> {
      const limit = options?.limit ?? 10;
      const mode: SearchMode = options?.mode ?? "fulltext";

      const where: Record<string, string | string[]> = {};
      if (options?.nodeTypes && options.nodeTypes.length > 0) {
        // biome-ignore lint/complexity/useLiteralKeys: index signature
        where["nodeType"] = options.nodeTypes;
      }
      if (options?.filePattern) {
        // biome-ignore lint/complexity/useLiteralKeys: index signature
        where["file"] = options.filePattern;
      }

      // Build search params based on mode
      const baseParams = {
        term: query,
        limit,
        ...(Object.keys(where).length > 0 ? { where } : {}),
      };

      if (mode === "vector" || mode === "hybrid") {
        if (!supportsVectors) {
          throw new Error(
            "Vector search requires index created with vectorDimensions option",
          );
        }
        if (!options?.vector) {
          throw new Error("Vector search requires a query vector");
        }

        const vectorParams = {
          ...baseParams,
          mode: mode as "vector" | "hybrid",
          vector: {
            value: Array.from(options.vector),
            property: "embedding",
          },
          similarity: options?.similarityThreshold ?? 0.5,
        };

        const results = await search(db as VectorIndex, vectorParams);
        return results.hits.map((hit) => ({
          id: hit.document.id,
          symbol: hit.document.symbol,
          file: hit.document.file,
          nodeType: hit.document.nodeType as NodeType,
          score: hit.score,
        }));
      }

      // Fulltext only
      const results = await search(db, baseParams);
      return results.hits.map((hit) => ({
        id: hit.document.id,
        symbol: hit.document.symbol,
        file: hit.document.file,
        nodeType: hit.document.nodeType as NodeType,
        score: hit.score,
      }));
    },

    async export(): Promise<RawData> {
      return save(db);
    },

    async count(): Promise<number> {
      return count(db);
    },
  };
};

/**
 * Create a new search index.
 *
 * @example
 * // Text-only search (BM25)
 * const index = await createSearchIndex();
 *
 * // Hybrid search (BM25 + vectors)
 * const index = await createSearchIndex({ vectorDimensions: 384 });
 */
export const createSearchIndex = async (
  options?: SearchIndexOptions,
): Promise<SearchIndexWrapper> => {
  const docsByFile = new Map<string, Set<string>>();
  const dims = options?.vectorDimensions;

  if (dims) {
    // Create index with vector support
    const schema = {
      id: "string",
      symbol: "string",
      file: "string",
      nodeType: "string",
      content: "string",
      embedding: `vector[${dims}]`,
    } as const;

    const db = create({ schema }) as VectorIndex;
    return buildWrapper(db, docsByFile, true);
  }

  // Create text-only index
  const schema = {
    id: "string",
    symbol: "string",
    file: "string",
    nodeType: "string",
    content: "string",
  } as const;

  const db = create({ schema }) as TextOnlyIndex;
  return buildWrapper(db, docsByFile, false);
};

/**
 * Restore a search index from exported data.
 *
 * @example
 * const data = JSON.parse(fs.readFileSync('.ts-graph-mcp/search.json', 'utf8'));
 * const index = await restoreSearchIndex(data);
 */
export const restoreSearchIndex = async (
  data: RawData,
  options?: SearchIndexOptions,
): Promise<SearchIndexWrapper> => {
  const docsByFile = new Map<string, Set<string>>();
  const dims = options?.vectorDimensions;

  let db: TextOnlyIndex | VectorIndex;
  let supportsVectors = false;

  if (dims) {
    const schema = {
      id: "string",
      symbol: "string",
      file: "string",
      nodeType: "string",
      content: "string",
      embedding: `vector[${dims}]`,
    } as const;

    db = create({ schema }) as VectorIndex;
    load(db, data);
    supportsVectors = true;
  } else {
    const schema = {
      id: "string",
      symbol: "string",
      file: "string",
      nodeType: "string",
      content: "string",
    } as const;

    db = create({ schema }) as TextOnlyIndex;
    load(db, data);
  }

  // Rebuild file tracking from restored data
  const allDocs = await search(db, { term: "", limit: 1000000 });
  for (const hit of allDocs.hits) {
    const file = hit.document.file;
    const ids = docsByFile.get(file) ?? new Set();
    ids.add(hit.document.id);
    docsByFile.set(file, ids);
  }

  return buildWrapper(db, docsByFile, supportsVectors);
};
