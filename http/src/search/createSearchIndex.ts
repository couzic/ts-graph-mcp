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
  searchVector,
} from "@orama/orama";
import type { NodeType } from "@ts-graph/shared";
import type { EmbeddingProvider } from "../embedding/EmbeddingTypes.js";
import type { EmbeddingCacheConnection } from "../embedding/embeddingCache.js";
import { computeHybridScore } from "./computeHybridScore.js";
import { cosineSimilarity } from "./cosineSimilarity.js";
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
  /** Open an embedding cache connection for cosine backfill. */
  openCache?: () => EmbeddingCacheConnection;
  /** Embedding provider for cache miss fallback. */
  embeddingProvider?: EmbeddingProvider;
  /** Batch lookup node embedding data (contentHash + snippet) by node IDs. */
  getNodeEmbeddingData?: (
    ids: string[],
  ) => Map<string, { contentHash: string; snippet: string }>;
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
  options: SearchIndexOptions,
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
      searchOptions?: SearchOptions,
    ): Promise<SearchResult[]> {
      const limit = searchOptions?.limit ?? 10;

      const where: Record<string, string | string[]> = {};
      if (searchOptions?.nodeTypes && searchOptions.nodeTypes.length > 0) {
        // biome-ignore lint/complexity/useLiteralKeys: index signature
        where["nodeType"] = searchOptions.nodeTypes;
      }
      if (searchOptions?.filePattern) {
        // biome-ignore lint/complexity/useLiteralKeys: index signature
        where["file"] = searchOptions.filePattern;
      }

      const baseParams = {
        term: query,
        limit,
        ...(Object.keys(where).length > 0 ? { where } : {}),
      };

      if (searchOptions?.vector) {
        // Run BM25 (wide net) and vector (caller's limit, similarity floor) in parallel
        const [bm25Results, vectorResults] = await Promise.all([
          search(db, { ...baseParams, limit: 1000 }),
          searchVector(db, {
            mode: "vector" as const,
            vector: {
              value: Array.from(searchOptions.vector),
              property: "embedding",
            },
            similarity: 0.6,
            limit,
          }),
        ]);

        // Merge by document ID (union)
        const merged = new Map<
          string,
          {
            bm25Score: number;
            cosineScore: number;
            doc: { id: string; symbol: string; file: string; nodeType: string };
          }
        >();

        const maxBm25 =
          bm25Results.hits.length > 0
            ? Math.max(...bm25Results.hits.map((h) => h.score))
            : 0;

        for (const hit of bm25Results.hits) {
          merged.set(hit.document.id, {
            bm25Score: hit.score,
            cosineScore: 0,
            doc: hit.document,
          });
        }

        for (const hit of vectorResults.hits) {
          const existing = merged.get(hit.document.id);
          if (existing) {
            existing.cosineScore = hit.score;
          } else {
            merged.set(hit.document.id, {
              bm25Score: 0,
              cosineScore: hit.score,
              doc: hit.document,
            });
          }
        }

        // Backfill cosine for BM25-only hits
        const bm25OnlyIds: string[] = [];
        for (const [id, entry] of merged) {
          if (entry.bm25Score > 0 && entry.cosineScore === 0) {
            bm25OnlyIds.push(id);
          }
        }

        if (
          bm25OnlyIds.length > 0 &&
          options.openCache &&
          options.embeddingProvider &&
          options.getNodeEmbeddingData
        ) {
          const nodeData = options.getNodeEmbeddingData(bm25OnlyIds);
          const hashes = [...nodeData.values()]
            .map((d) => d.contentHash)
            .filter(Boolean);

          const cache = options.openCache();
          try {
            const cachedEmbeddings = cache.getBatch(hashes);

            // Build hash→embedding map, computing missing ones
            const embeddingByHash = new Map<string, Float32Array>(
              cachedEmbeddings,
            );
            for (const [, data] of nodeData) {
              if (data.contentHash && !embeddingByHash.has(data.contentHash)) {
                const embedding = await options.embeddingProvider.embedDocument(
                  data.snippet,
                );
                cache.set(data.contentHash, embedding);
                embeddingByHash.set(data.contentHash, embedding);
              }
            }

            // Compute cosine for each BM25-only hit
            for (const id of bm25OnlyIds) {
              const data = nodeData.get(id);
              if (!data) {
                console.warn(
                  `[ts-graph] Orama/SQLite desync: node "${id}" found in search index but not in nodes table`,
                );
                continue;
              }
              const entry = merged.get(id);
              if (data.contentHash && entry) {
                const embedding = embeddingByHash.get(data.contentHash);
                if (embedding) {
                  entry.cosineScore = cosineSimilarity(
                    searchOptions.vector,
                    embedding,
                  );
                }
              }
            }
          } finally {
            cache.close();
          }
        }

        const results: SearchResult[] = [];
        for (const entry of merged.values()) {
          const hybridScore = computeHybridScore(
            entry.bm25Score,
            maxBm25,
            entry.cosineScore,
          );
          if (hybridScore > 0) {
            results.push({
              id: entry.doc.id,
              symbol: entry.doc.symbol,
              file: entry.doc.file,
              nodeType: entry.doc.nodeType as NodeType,
              score: hybridScore,
            });
          }
        }

        results.sort((a, b) => b.score - a.score);
        return results.slice(0, limit);
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
  return buildWrapper(db, docsByFile, options);
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

  return buildWrapper(db, docsByFile, options);
};
