import type { Edge, Node, TraversalOptions } from "./Types.js";

/**
 * Path result from graph traversal.
 */
export interface PathResult {
  /** Node IDs in order from source to target */
  nodes: string[];
  /** Edges connecting consecutive nodes */
  edges: Edge[];
}

/**
 * Read operations for the code graph.
 * Used by: Query Module (MCP tools)
 *
 * @example
 * const reader = createSqliteReader(db);
 * const edges = reader.queryDependencies("src/api.ts:handleRequest");
 */
export interface DbReader {
  /**
   * Forward traversal - find all code that a node depends on.
   *
   * @param nodeId - Starting node ID
   * @param options - Traversal options (maxDepth, edgeTypes)
   * @returns Edges in the reachable subgraph
   */
  queryDependencies(nodeId: string, options?: TraversalOptions): Edge[];

  /**
   * Backward traversal - find all code that depends on a node.
   *
   * @param nodeId - Target node ID
   * @param options - Traversal options (maxDepth, edgeTypes)
   * @returns Edges in the reachable subgraph
   */
  queryDependents(nodeId: string, options?: TraversalOptions): Edge[];

  /**
   * Find paths between two nodes.
   *
   * @param fromId - Starting node ID
   * @param toId - Target node ID
   * @param options - Traversal options (maxDepth)
   * @returns Array of paths (empty if no path exists)
   */
  queryPaths(
    fromId: string,
    toId: string,
    options?: TraversalOptions,
  ): PathResult[];

  /**
   * Get a single node by ID.
   *
   * @param id - Node ID
   * @returns Node or null if not found
   */
  getNode(id: string): Node | null;

  /**
   * Get multiple nodes by ID.
   *
   * @param ids - Array of node IDs
   * @returns Array of found nodes (missing IDs silently omitted)
   */
  getNodes(ids: string[]): Node[];

  /**
   * Find nodes by symbol name, optionally scoped to a file.
   *
   * @param symbol - Symbol name (e.g., "formatDate", "User.save")
   * @param filePath - Optional file path filter
   * @returns Matching nodes
   */
  findNodesBySymbol(symbol: string, filePath?: string): Node[];
}
