import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { NodeType } from "@ts-graph/shared";
import type Database from "better-sqlite3";
import type { EmbeddingProvider } from "../embedding/EmbeddingTypes.js";
import {
  computeContentHash,
  type EmbeddingCacheConnection,
} from "../embedding/embeddingCache.js";
import { prepareEmbeddingContent } from "../embedding/prepareEmbeddingContent.js";
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
  content_hash: string | null;
  start_line: number;
  end_line: number;
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
  /** Project root path for reading source files on cache miss */
  projectRoot: string;
}

/**
 * Extract source snippet from file using line numbers.
 */
const extractSnippetFromFile = (
  projectRoot: string,
  filePath: string,
  startLine: number,
  endLine: number,
): string => {
  const fullPath = join(projectRoot, filePath);
  const content = readFileSync(fullPath, "utf-8");
  const lines = content.split("\n");
  const startIdx = startLine - 1; // 1-indexed to 0-indexed
  return lines.slice(startIdx, endLine).join("\n");
};

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
 *   projectRoot: "/path/to/project",
 * });
 * cache.close();
 */
export const populateSearchIndex = async (
  options: PopulateSearchIndexOptions,
): Promise<PopulateSearchIndexResult> => {
  const { db, searchIndex, embeddingCache, embeddingProvider, projectRoot } =
    options;

  // Query all nodes with content_hash and line numbers for cache lookup and regeneration
  const rows = db
    .prepare<[], NodeRow>(
      `SELECT id, name, file_path, type, content_hash, start_line, end_line FROM nodes`,
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

    // Batch cache lookup (only for rows with content_hash)
    const hashesToLookup = batch
      .filter((r) => r.content_hash !== null)
      .map((r) => r.content_hash as string);

    const cachedEmbeddings =
      hashesToLookup.length > 0
        ? embeddingCache.getBatch(hashesToLookup)
        : new Map<string, Float32Array>();

    // Separate cache hits from misses
    const hits: Array<{ row: NodeRow; embedding: Float32Array }> = [];
    const misses: NodeRow[] = [];

    for (const row of batch) {
      if (!row.content_hash) {
        throw new Error(
          `Node ${row.id} is missing content_hash. Cannot lookup embedding in cache.`,
        );
      }
      const embedding = cachedEmbeddings.get(row.content_hash);
      if (embedding) {
        hits.push({ row, embedding });
        cacheHits++;
      } else {
        misses.push(row);
      }
    }

    // Regenerate cache misses in parallel
    const regeneratedEmbeddings = await Promise.all(
      misses.map(async (row) => {
        const snippet = extractSnippetFromFile(
          projectRoot,
          row.file_path,
          row.start_line,
          row.end_line,
        );
        const content = prepareEmbeddingContent(
          row.type,
          row.name,
          row.file_path,
          snippet,
        );
        const embedding = await embeddingProvider.embedDocument(content);
        const hash = computeContentHash(content);
        embeddingCache.set(hash, embedding);
        regenerated++;
        return embedding;
      }),
    );

    // Build search documents
    const docs: SearchDocument[] = [
      ...hits.map(({ row, embedding }) => ({
        id: row.id,
        symbol: row.name,
        file: row.file_path,
        nodeType: row.type as NodeType,
        content: row.name,
        embedding,
      })),
      ...misses.map((row, idx) => ({
        id: row.id,
        symbol: row.name,
        file: row.file_path,
        nodeType: row.type as NodeType,
        content: row.name,
        embedding: regeneratedEmbeddings[idx],
      })),
    ];

    await searchIndex.addBatch(docs);
  }

  return { total: rows.length, cacheHits, regenerated };
};
