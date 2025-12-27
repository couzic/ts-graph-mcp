import type { GraphEdge } from "./GraphTypes.js";

/**
 * Collect unique node IDs from edges, excluding specified IDs.
 */
export const collectNodeIds = (
  edges: GraphEdge[],
  excludeId: string,
): string[] => {
  const nodeIds = new Set<string>();
  for (const edge of edges) {
    nodeIds.add(edge.source);
    nodeIds.add(edge.target);
  }
  nodeIds.delete(excludeId);
  return [...nodeIds];
};
