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
  embedding?: number[];
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
 * Search mode for queries.
 */
export type SearchMode = "fulltext" | "vector" | "hybrid";

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
  /** Search mode: fulltext (BM25), vector (semantic), or hybrid (default: fulltext) */
  mode?: SearchMode;
  /** Query vector (required for vector/hybrid mode) */
  vector?: number[];
  /** Similarity threshold for vector search (0-1, default: 0.5) */
  similarityThreshold?: number;
}
