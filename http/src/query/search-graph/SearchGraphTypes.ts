/**
 * Endpoint specification for searchGraph.
 *
 * Two modes:
 * - `symbol`: Exact match, returns single node
 * - `query`: Lexical + semantic search, can return multiple nodes
 */
export interface GraphEndpoint {
  /** Lexical + semantic search (can return multiple matching nodes) */
  query?: string;
  /** Exact symbol name (single node) */
  symbol?: string;
  /** File path filter (optional constraint) */
  file_path?: string;
}

/**
 * Input parameters for searchGraph.
 *
 * Query patterns:
 * - `{ from }` → forward traversal (show dependencies)
 * - `{ to }` → backward traversal (show dependents)
 * - `{ from, to }` → path finding
 * - `{ topic }` → filter graph to topic-relevant nodes
 * - `{ topic, from }` → traversal filtered by topic
 */
export interface SearchGraphInput {
  /** Filter to focus on topic-relevant nodes in the graph */
  topic?: string;
  /** Start node(s) - what does this depend on? */
  from?: GraphEndpoint;
  /** End node(s) - what depends on this? */
  to?: GraphEndpoint;
  /** Maximum nodes in output (default: 50) */
  max_nodes?: number;
}

/**
 * Validated input with at least one constraint.
 */
export type ValidatedSearchGraphInput = SearchGraphInput & {
  // At least one of topic, from, or to must be present
  topic?: string;
  from?: GraphEndpoint;
  to?: GraphEndpoint;
};
