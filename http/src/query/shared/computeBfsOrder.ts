import type { GraphEdge } from "./GraphTypes.js";

const BIDIRECTIONAL_TYPES = new Set(["IMPLEMENTS", "EXTENDS"]);

/**
 * Compute BFS traversal order from root nodes.
 *
 * Used by truncateEdges to select which nodes survive truncation.
 * BFS ensures direct neighbors are visited before deeper descendants.
 * IMPLEMENTS/EXTENDS edges are treated as bidirectional in the adjacency
 * so that reverse-discovered nodes appear deeper in BFS order.
 *
 * @spec tool::output.truncation
 * @spec tool::query.edge-priority-truncation
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
  // IMPLEMENTS/EXTENDS are bidirectional: also add reverse adjacency
  const adjacency = new Map<string, string[]>();
  const allNodes = new Set<string>();
  const targets = new Set<string>();

  const addNeighbor = (from: string, to: string) => {
    const neighbors = adjacency.get(from);
    if (neighbors) {
      if (!neighbors.includes(to)) {
        neighbors.push(to);
      }
    } else {
      adjacency.set(from, [to]);
    }
  };

  for (const edge of edges) {
    allNodes.add(edge.source);
    allNodes.add(edge.target);
    targets.add(edge.target);

    addNeighbor(edge.source, edge.target);

    if (BIDIRECTIONAL_TYPES.has(edge.type)) {
      targets.add(edge.source);
      addNeighbor(edge.target, edge.source);
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
    // biome-ignore lint/style/noNonNullAssertion: edges is non-empty (checked at function entry)
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
    // biome-ignore lint/style/noNonNullAssertion: length checked in while condition
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
        // biome-ignore lint/style/noNonNullAssertion: length checked in while condition
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
