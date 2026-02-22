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
   * Remove all nodes and outgoing edges from a file.
   * Used for incremental re-indexing (file still exists, will be re-indexed).
   * Incoming edges are preserved since the file's nodes will be recreated.
   * Idempotent (no error if file not indexed).
   *
   * @param filePath - Relative file path
   */
  removeFileNodes(filePath: string): Promise<void>;

  /**
   * Remove all nodes and all edges (outgoing + incoming) from a file.
   * Used when a file is permanently deleted from the project.
   * Idempotent (no error if file not indexed).
   *
   * @param filePath - Relative file path
   */
  deleteFile(filePath: string): Promise<void>;

  /**
   * Clear the entire graph.
   * Removes all nodes and edges.
   *
   * WARNING: Destructive operation.
   */
  clearAll(): Promise<void>;
}
