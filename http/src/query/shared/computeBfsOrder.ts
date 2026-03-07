import type { GraphEdge } from "./GraphTypes.js";

/**
 * Compute BFS traversal order from root nodes.
 *
 * Used by truncateEdges to select which nodes survive truncation.
 * BFS ensures direct neighbors are visited before deeper descendants.
 *
 * @spec tool::output.truncation
 *
 * @example
 * computeBfsOrder([
 *   { source: "A", target: "B", type: "CALLS" },
 *   { source: "A", target: "C", type: "CALLS" },
 *   { source: "B", target: "D", type: "CALLS" },
 * ]) // ["A", "B", "C", "D"]
 */
export const computeBfsOrder = (edges: GraphEdge[]): string[] => {
  if (edges.length === 0) {
    return [];
  }

  // Build adjacency list (outgoing edges per node)
  const adjacency = new Map<string, string[]>();
  const allNodes = new Set<string>();
  const targets = new Set<string>();

  for (const edge of edges) {
    allNodes.add(edge.source);
    allNodes.add(edge.target);
    targets.add(edge.target);

    const neighbors = adjacency.get(edge.source);
    if (neighbors) {
      if (!neighbors.includes(edge.target)) {
        neighbors.push(edge.target);
      }
    } else {
      adjacency.set(edge.source, [edge.target]);
    }
  }

  // Find root nodes (sources that are never targets)
  const roots: string[] = [];
  for (const node of allNodes) {
    if (!targets.has(node)) {
      roots.push(node);
    }
  }

  // If no roots (cycle), start from first edge source
  if (roots.length === 0) {
    roots.push(edges[0]!.source);
  }

  // BFS from all roots
  const visited = new Set<string>();
  const order: string[] = [];
  const queue: string[] = [...roots];

  for (const root of roots) {
    visited.add(root);
  }

  while (queue.length > 0) {
    const node = queue.shift()!;
    order.push(node);

    const neighbors = adjacency.get(node);
    if (neighbors) {
      for (const neighbor of neighbors) {
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          queue.push(neighbor);
        }
      }
    }
  }

  // Handle disconnected components
  for (const node of allNodes) {
    if (!visited.has(node)) {
      visited.add(node);
      order.push(node);
      // BFS from this disconnected node
      const subQueue: string[] = [node];
      while (subQueue.length > 0) {
        const current = subQueue.shift()!;
        const neighbors = adjacency.get(current);
        if (neighbors) {
          for (const neighbor of neighbors) {
            if (!visited.has(neighbor)) {
              visited.add(neighbor);
              order.push(neighbor);
              subQueue.push(neighbor);
            }
          }
        }
      }
    }
  }

  return order;
};
