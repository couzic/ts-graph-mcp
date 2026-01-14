import type { GraphEdge } from "./GraphTypes.js";

/**
 * Collect unique node IDs from edges.
 */
export const collectNodeIds = (edges: GraphEdge[]): string[] => {
  const nodeIds = new Set<string>();
  for (const edge of edges) {
    nodeIds.add(edge.source);
    nodeIds.add(edge.target);
  }
  return [...nodeIds];
};
