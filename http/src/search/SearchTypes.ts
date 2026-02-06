import type { NodeType } from "@ts-graph/shared";

/**
 * Document stored in the search index.
 * Each symbol in the graph becomes a searchable document.
 */
export interface SearchDocument {
  /** Internal node ID (e.g., "src/utils.ts:formatDate") */
  id: string;
  /** Symbol name (e.g., "formatDate") */
  symbol: string;
  /** File path (e.g., "src/utils.ts") */
  file: string;
  /** Node type (e.g., "Function", "Class") */
  nodeType: NodeType;
  /** Preprocessed text for BM25 (split camelCase + comments) */
  content: string;
  /** Embedding vector (optional - for semantic search) */
  embedding?: Float32Array;
}

/**
 * Search result from hybrid search.
 */
export interface SearchResult {
  /** Node ID */
  id: string;
  /** Symbol name */
  symbol: string;
  /** File path */
  file: string;
  /** Node type */
  nodeType: NodeType;
  /** Search relevance score (0-1, higher is better) */
  score: number;
}

/**
 * Options for search queries.
 */
export interface SearchOptions {
  /** Maximum results to return (default: 10) */
  limit?: number;
  /** Filter by node type(s) */
  nodeTypes?: NodeType[];
  /** Filter by file path pattern (glob) */
  filePattern?: string;
  /** Query vector for hybrid search (BM25 + vector). If omitted, fulltext only. */
  vector?: Float32Array;
  /** Similarity threshold for vector search (0-1, default: 0.5) */
  similarityThreshold?: number;
}
