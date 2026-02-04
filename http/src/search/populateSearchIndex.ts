import { join } from "node:path";
import type { NodeType } from "@ts-graph/shared";
import type Database from "better-sqlite3";
import type { Project, SourceFile } from "ts-morph";
import type { Node } from "../db/Types.js";
import type { EmbeddingProvider } from "../embedding/EmbeddingTypes.js";
import {
  computeContentHash,
  type EmbeddingCacheConnection,
} from "../embedding/embeddingCache.js";
import {
  extractSourceSnippet,
  prepareEmbeddingContent,
} from "../ingestion/indexFile.js";
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
  package: string;
}

/**
 * Result of populating the search index.
 */
export interface PopulateSearchIndexResult {
  /** Total number of nodes indexed */
  total: number;
  /** Number of embeddings found in cache */
  cacheHits: number;
  /** Number of embeddings generated (cache misses) */
  cacheMisses: number;
}

/**
 * Options for populating the search index.
 */
export interface PopulateSearchIndexOptions {
  /** SQLite database connection */
  db: Database.Database;
  /** Search index wrapper */
  searchIndex: SearchIndexWrapper;
  /** Embedding cache (optional - if missing, BM25 only) */
  embeddingCache?: EmbeddingCacheConnection;
  /** Embedding provider (optional - if missing, skip cache miss generation) */
  embeddingProvider?: EmbeddingProvider;
  /** ts-morph Projects by package name (optional - required for cache miss handling) */
  projects?: Map<string, Project>;
  /** Project root directory (optional - required if projects provided) */
  projectRoot?: string;
}

/**
 * Build a Node-like object from a database row for prepareEmbeddingContent.
 */
const rowToNodeLike = (row: NodeRow): Node => ({
  id: row.id,
  name: row.name,
  filePath: row.file_path,
  type: row.type as NodeType,
  startLine: row.start_line,
  endLine: row.end_line,
  package: row.package,
  exported: true, // Not used for embedding content
});

/**
 * Get source file from ts-morph project.
 */
const getSourceFile = (
  projects: Map<string, Project>,
  projectRoot: string,
  row: NodeRow,
): SourceFile | undefined => {
  const project = projects.get(row.package);
  if (!project) {
    return undefined;
  }
  const absolutePath = join(projectRoot, row.file_path);
  return project.getSourceFile(absolutePath);
};

/**
 * Generate embedding for a cache miss.
 */
const generateEmbedding = async (
  row: NodeRow,
  projects: Map<string, Project> | undefined,
  projectRoot: string | undefined,
  embeddingProvider: EmbeddingProvider,
  embeddingCache?: EmbeddingCacheConnection,
): Promise<Float32Array | undefined> => {
  if (!projects || !projectRoot) {
    return undefined;
  }
  const sourceFile = getSourceFile(projects, projectRoot, row);
  if (!sourceFile) {
    return undefined;
  }

  const node = rowToNodeLike(row);
  const snippet = extractSourceSnippet(sourceFile.getFullText(), node);
  const content = prepareEmbeddingContent(node, snippet);

  try {
    const embedding = await embeddingProvider.embedDocument(content);
    // Store in cache for future use
    const hash = computeContentHash(content);
    embeddingCache?.set(hash, embedding);
    return embedding;
  } catch {
    // Embedding failed (e.g., context overflow) - return undefined
    return undefined;
  }
};

/**
 * Load all nodes from the database into the search index with embeddings.
 *
 * This function rebuilds the search index from SQLite + embedding cache on startup.
 * For cache misses, it parses source files and generates embeddings.
 *
 * @example
 * const result = await populateSearchIndex({
 *   db,
 *   searchIndex,
 *   embeddingCache,
 *   embeddingProvider,
 *   projects,
 *   projectRoot: process.cwd(),
 * });
 */
export const populateSearchIndex = async (
  options: PopulateSearchIndexOptions,
): Promise<PopulateSearchIndexResult> => {
  const {
    db,
    searchIndex,
    embeddingCache,
    embeddingProvider,
    projects,
    projectRoot,
  } = options;

  // Query all nodes with content_hash for cache lookup
  const rows = db
    .prepare<[], NodeRow>(
      `SELECT id, name, file_path, type, content_hash, start_line, end_line, package
       FROM nodes`,
    )
    .all();

  if (rows.length === 0) {
    return { total: 0, cacheHits: 0, cacheMisses: 0 };
  }

  let cacheHits = 0;
  let cacheMisses = 0;

  const totalBatches = Math.ceil(rows.length / BATCH_SIZE);

  // Process in batches
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const batch = rows.slice(i, i + BATCH_SIZE);

    // Batch cache lookup (only for rows with content_hash)
    const hashesToLookup = batch
      .filter((r) => r.content_hash !== null)
      .map((r) => r.content_hash as string);

    const cachedEmbeddings =
      hashesToLookup.length > 0 && embeddingCache
        ? embeddingCache.getBatch(hashesToLookup)
        : new Map<string, Float32Array>();

    // Separate cache hits from misses
    const hits: Array<{ row: NodeRow; embedding: Float32Array }> = [];
    const misses: NodeRow[] = [];

    for (const row of batch) {
      const embedding = row.content_hash
        ? cachedEmbeddings.get(row.content_hash)
        : undefined;
      if (embedding) {
        hits.push({ row, embedding });
        cacheHits++;
      } else {
        misses.push(row);
      }
    }

    // Generate missing embeddings in parallel (if provider available)
    let generatedEmbeddings: Array<Float32Array | undefined>;
    if (embeddingProvider && misses.length > 0) {
      generatedEmbeddings = await Promise.all(
        misses.map((row) =>
          generateEmbedding(
            row,
            projects,
            projectRoot,
            embeddingProvider,
            embeddingCache,
          ),
        ),
      );
      cacheMisses += misses.length;
    } else {
      generatedEmbeddings = misses.map(() => undefined);
      cacheMisses += misses.length;
    }

    // Build search documents
    const docs: SearchDocument[] = [
      ...hits.map(({ row, embedding }) => ({
        id: row.id,
        symbol: row.name,
        file: row.file_path,
        nodeType: row.type as NodeType,
        content: row.name, // BM25 content
        embedding,
      })),
      ...misses.map((row, idx) => ({
        id: row.id,
        symbol: row.name,
        file: row.file_path,
        nodeType: row.type as NodeType,
        content: row.name, // BM25 content
        embedding: generatedEmbeddings[idx],
      })),
    ];

    await searchIndex.addBatch(docs);

    // Log progress for cache misses (indicates slow startup)
    const missCount = misses.filter(
      (_, idx) => generatedEmbeddings[idx] !== undefined,
    ).length;
    if (missCount > 0) {
      console.log(
        `[populateSearchIndex] Batch ${batchNum}/${totalBatches}: ${hits.length} cache hits, ${missCount} generated`,
      );
    }
  }

  // Final summary
  if (cacheMisses > 0 && embeddingProvider) {
    console.log(
      `[populateSearchIndex] Complete: ${cacheHits} cache hits, ${cacheMisses} generated`,
    );
  }

  return { total: rows.length, cacheHits, cacheMisses };
};
