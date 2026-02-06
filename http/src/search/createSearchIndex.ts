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
}

/**
 * Options for creating a search index.
 */
export interface SearchIndexOptions {
  /** Vector dimensions (e.g., 384, 768, 1024). */
  vectorDimensions: number;
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

type SearchSchema = {
  id: "string";
  symbol: "string";
  file: "string";
  nodeType: "string";
  content: "string";
  embedding: `vector[${number}]`;
};

type SearchIndex = Orama<SearchSchema>;

/**
 * Build the search wrapper methods.
 */
const buildWrapper = (
  db: SearchIndex,
  docsByFile: Map<string, Set<string>>,
): SearchIndexWrapper => {
  const trackDoc = (doc: SearchDocument) => {
    const ids = docsByFile.get(doc.file) ?? new Set();
    ids.add(doc.id);
    docsByFile.set(doc.file, ids);
  };

  return {
    async add(doc: SearchDocument): Promise<void> {
      const baseDoc = {
        id: doc.id,
        symbol: doc.symbol,
        file: doc.file,
        nodeType: doc.nodeType,
        content: `${preprocessForBM25(doc.symbol)} ${doc.content}`,
      };

      if (doc.embedding) {
        await insert(db, {
          ...baseDoc,
          embedding: Array.from(doc.embedding),
        });
      } else {
        // Orama accepts docs without the vector field at runtime
        // biome-ignore lint/suspicious/noExplicitAny: Orama typing mismatch
        await insert(db, baseDoc as any);
      }
      trackDoc(doc);
    },

    async addBatch(docs: SearchDocument[]): Promise<void> {
      const docsWithEmbeddings = docs.filter(
        (doc) => doc.embedding && doc.embedding.length > 0,
      );
      const docsWithoutEmbeddings = docs.filter(
        (doc) => !doc.embedding || doc.embedding.length === 0,
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
        await insertMultiple(db, prepared);
      }

      if (docsWithoutEmbeddings.length > 0) {
        const prepared = docsWithoutEmbeddings.map((doc) => ({
          id: doc.id,
          symbol: doc.symbol,
          file: doc.file,
          nodeType: doc.nodeType,
          content: `${preprocessForBM25(doc.symbol)} ${doc.content}`,
        }));
        // Orama accepts docs without the vector field at runtime
        // biome-ignore lint/suspicious/noExplicitAny: Orama typing mismatch
        await insertMultiple(db, prepared as any);
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

      const where: Record<string, string | string[]> = {};
      if (options?.nodeTypes && options.nodeTypes.length > 0) {
        // biome-ignore lint/complexity/useLiteralKeys: index signature
        where["nodeType"] = options.nodeTypes;
      }
      if (options?.filePattern) {
        // biome-ignore lint/complexity/useLiteralKeys: index signature
        where["file"] = options.filePattern;
      }

      const baseParams = {
        term: query,
        limit,
        ...(Object.keys(where).length > 0 ? { where } : {}),
      };

      if (options?.vector) {
        const vectorParams = {
          ...baseParams,
          mode: "hybrid" as const,
          vector: {
            value: Array.from(options.vector),
            property: "embedding",
          },
          similarity: options?.similarityThreshold ?? 0.5,
        };

        const results = await search(db, vectorParams);
        return results.hits.map((hit) => ({
          id: hit.document.id,
          symbol: hit.document.symbol,
          file: hit.document.file,
          nodeType: hit.document.nodeType as NodeType,
          score: hit.score,
        }));
      }

      // Fulltext only (no vector provided)
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
 * const index = await createSearchIndex({ vectorDimensions: 384 });
 */
export const createSearchIndex = async (
  options: SearchIndexOptions,
): Promise<SearchIndexWrapper> => {
  const docsByFile = new Map<string, Set<string>>();

  const schema = {
    id: "string",
    symbol: "string",
    file: "string",
    nodeType: "string",
    content: "string",
    embedding: `vector[${options.vectorDimensions}]`,
  } as const;

  const db = create({ schema }) as SearchIndex;
  return buildWrapper(db, docsByFile);
};

/**
 * Restore a search index from exported data.
 *
 * @example
 * const data = JSON.parse(fs.readFileSync('.ts-graph-mcp/search.json', 'utf8'));
 * const index = await restoreSearchIndex(data, { vectorDimensions: 384 });
 */
export const restoreSearchIndex = async (
  data: RawData,
  options: SearchIndexOptions,
): Promise<SearchIndexWrapper> => {
  const docsByFile = new Map<string, Set<string>>();

  const schema = {
    id: "string",
    symbol: "string",
    file: "string",
    nodeType: "string",
    content: "string",
    embedding: `vector[${options.vectorDimensions}]`,
  } as const;

  const db = create({ schema }) as SearchIndex;
  load(db, data);

  // Rebuild file tracking from restored data
  const allDocs = await search(db, { term: "", limit: 1000000 });
  for (const hit of allDocs.hits) {
    const file = hit.document.file;
    const ids = docsByFile.get(file) ?? new Set();
    ids.add(hit.document.id);
    docsByFile.set(file, ids);
  }

  return buildWrapper(db, docsByFile);
};
