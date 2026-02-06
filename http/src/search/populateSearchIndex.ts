import type { NodeType } from "@ts-graph/shared";
import type Database from "better-sqlite3";
import type { EmbeddingProvider } from "../embedding/EmbeddingTypes.js";
import type { EmbeddingCacheConnection } from "../embedding/embeddingCache.js";
import { embedWithFallback } from "../embedding/embedWithFallback.js";
import type { SearchIndexWrapper } from "./createSearchIndex.js";
import type { SearchDocument } from "./SearchTypes.js";

const BATCH_SIZE = 500;

/**
 * Row type from SQLite nodes query.
 */
interface NodeRow {
  id: string;
  name: string;
  file_path: string;
  type: string;
  content_hash: string;
  snippet: string;
}

/**
 * Result of populating the search index.
 */
export interface PopulateSearchIndexResult {
  /** Total number of nodes indexed */
  total: number;
  /** Number of embeddings found in cache */
  cacheHits: number;
  /** Number of embeddings regenerated (cache misses) */
  regenerated: number;
}

/**
 * Options for populating the search index.
 */
export interface PopulateSearchIndexOptions {
  /** SQLite database connection */
  db: Database.Database;
  /** Search index wrapper */
  searchIndex: SearchIndexWrapper;
  /** Embedding cache for restoring embeddings on startup */
  embeddingCache: EmbeddingCacheConnection;
  /** Embedding provider for regenerating cache misses */
  embeddingProvider: EmbeddingProvider;
}

/**
 * Load all nodes from the database into the search index with embeddings from cache.
 *
 * This function rebuilds the search index from SQLite + embedding cache on startup.
 * Embeddings are loaded from cache. Cache misses are regenerated using the embedding provider.
 *
 * @example
 * const cache = openEmbeddingCache(cacheDir, modelName);
 * const result = await populateSearchIndex({
 *   db,
 *   searchIndex,
 *   embeddingCache: cache,
 *   embeddingProvider,
 * });
 * cache.close();
 */
export const populateSearchIndex = async (
  options: PopulateSearchIndexOptions,
): Promise<PopulateSearchIndexResult> => {
  const { db, searchIndex, embeddingCache, embeddingProvider } = options;

  // Query all nodes with content_hash and snippet
  const rows = db
    .prepare<[], NodeRow>(
      `SELECT id, name, file_path, type, content_hash, snippet FROM nodes`,
    )
    .all();

  if (rows.length === 0) {
    return { total: 0, cacheHits: 0, regenerated: 0 };
  }

  let cacheHits = 0;
  let regenerated = 0;

  // Process in batches
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);

    // Batch cache lookup
    const hashesToLookup = batch.map((r) => r.content_hash);

    const cachedEmbeddings = embeddingCache.getBatch(hashesToLookup);

    // Separate cache hits from misses
    const hits: Array<{ row: NodeRow; embedding: Float32Array }> = [];
    const misses: NodeRow[] = [];

    for (const row of batch) {
      const embedding = cachedEmbeddings.get(row.content_hash);
      if (embedding) {
        hits.push({ row, embedding });
        cacheHits++;
      } else {
        misses.push(row);
      }
    }

    // Regenerate cache misses in parallel using snippet from DB
    // Uses embedWithFallback for progressive truncation on context overflow
    const regeneratedResults = await Promise.all(
      misses.map(async (row) => {
        const result = await embedWithFallback(
          row.type,
          row.name,
          row.file_path,
          row.snippet,
          embeddingProvider,
          embeddingCache,
        );
        regenerated++;
        return result.embedding;
      }),
    );

    // Build search documents (use snippet for BM25 content when available)
    const docs: SearchDocument[] = [
      ...hits.map(({ row, embedding }) => ({
        id: row.id,
        symbol: row.name,
        file: row.file_path,
        nodeType: row.type as NodeType,
        content: row.snippet,
        embedding,
      })),
      ...misses.map((row, idx) => ({
        id: row.id,
        symbol: row.name,
        file: row.file_path,
        nodeType: row.type as NodeType,
        content: row.snippet,
        embedding: regeneratedResults[idx],
      })),
    ];

    await searchIndex.addBatch(docs);
  }

  return { total: rows.length, cacheHits, regenerated };
};
