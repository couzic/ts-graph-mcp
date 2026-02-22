/**
 * Endpoint specification for searchGraph.
 *
 * Two modes:
 * - `symbol`: Exact match, returns single node
 * - `query`: Lexical + semantic search, can return multiple nodes
 */
export type GraphEndpoint =
  | {
      /** Lexical + semantic search (can return multiple matching nodes) */
      query: string;
    }
  | {
      /** Exact symbol name (single node) */
      symbol: string;
      /** File path filter (optional constraint) */
      file_path?: string;
    };

/**
 * Input parameters for searchGraph.
 *
 * Query patterns:
 * - `{ from }` → forward traversal (show dependencies)
 * - `{ to }` → backward traversal (show dependents)
 * - `{ from, to }` → path finding
 * - `{ topic }` → standalone semantic search (not combinable with from/to)
 */
export type SearchGraphInput = (
  | {
      /** Standalone semantic search (not combinable with from/to) */
      topic: string;
    }
  | {
      /** Start node(s) - what does this depend on? */
      from?: GraphEndpoint;
      /** End node(s) - what depends on this? */
      to?: GraphEndpoint;
    }
) & {
  /** Maximum nodes in output (default: 50) */
  max_nodes?: number;
};
