import type { Edge, Node } from "./Types.js";

/**
 * Write to the code graph (create, update, delete).
 * Used by: Code Ingestion Module
 */
export interface DbWriter {
  /**
   * Add multiple nodes in a single batch.
   * Uses upsert semantics (insert or update if exists).
   *
   * @param nodes - Array of nodes to add
   * @throws Error on first failure (fail-fast)
   */
  addNodes(nodes: Node[]): Promise<void>;

  /**
   * Add multiple edges in a single batch.
   * Source and target nodes must exist.
   * Uses upsert semantics.
   *
   * @param edges - Array of edges to add
   * @throws Error on first failure (fail-fast)
   */
  addEdges(edges: Edge[]): Promise<void>;

  /**
   * Remove all nodes (and their edges) from a file.
   * Used for incremental re-indexing.
   * Idempotent (no error if file not indexed).
   *
   * @param filePath - Relative file path
   */
  removeFileNodes(filePath: string): Promise<void>;

  /**
   * Clear the entire graph.
   * Removes all nodes and edges.
   *
   * WARNING: Destructive operation.
   */
  clearAll(): Promise<void>;
}
