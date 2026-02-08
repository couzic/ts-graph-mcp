import { buildAliasMap } from "./buildAliasMap.js";
import { buildDisplayNames } from "./buildDisplayNames.js";
import { extractSymbol } from "./extractSymbol.js";
import type { GraphEdge } from "./GraphTypes.js";

/** Result of formatGraph including traversal order */
export interface FormatGraphResult {
  text: string;
  nodeOrder: string[];
}

/**
 * Format edges into chain-compacted Graph section.
 *
 * Rules:
 * - Linear chains on single line: A --CALLS--> B --CALLS--> C
 * - Branch points start new lines
 * - Uses symbol names, not full IDs
 * - Disambiguates with #N when names collide
 *
 * @returns Object with formatted text and node order (for consistent Nodes section ordering)
 */
export const formatGraph = (
  edges: GraphEdge[],
  aliasMap?: Map<string, string>,
): FormatGraphResult => {
  if (edges.length === 0) return { text: "", nodeOrder: [] };

  // Collect all node IDs
  const allNodeIds = new Set<string>();
  for (const edge of edges) {
    allNodeIds.add(edge.source);
    allNodeIds.add(edge.target);
  }

  // Build display names with disambiguation
  const effectiveAliasMap = aliasMap ?? buildAliasMap(edges);
  const displayNames = buildDisplayNames([...allNodeIds], effectiveAliasMap);

  // Build adjacency list
  const outgoing = new Map<string, GraphEdge[]>();
  const incoming = new Set<string>();

  for (const edge of edges) {
    const existing = outgoing.get(edge.source);
    if (existing) {
      existing.push(edge);
    } else {
      outgoing.set(edge.source, [edge]);
    }
    incoming.add(edge.target);
  }

  // Find root nodes (sources that are not targets in this subgraph)
  const roots = [...allNodeIds].filter((id) => !incoming.has(id));

  // If no roots (cycle), pick first edge source
  const firstEdge = edges[0];
  if (roots.length === 0 && firstEdge) {
    roots.push(firstEdge.source);
  }

  const lines: string[] = [];
  const visitedEdges = new Set<string>();
  const nodeOrder: string[] = [];
  const visitedNodes = new Set<string>();

  const edgeKey = (e: GraphEdge): string => `${e.source}|${e.target}|${e.type}`;

  const getDisplayName = (nodeId: string): string =>
    displayNames.get(nodeId) ?? extractSymbol(nodeId);

  const trackNode = (nodeId: string): void => {
    if (!visitedNodes.has(nodeId)) {
      visitedNodes.add(nodeId);
      nodeOrder.push(nodeId);
    }
  };

  const buildChain = (startNode: string): void => {
    trackNode(startNode);
    let line = getDisplayName(startNode);
    let current = startNode;
    const branchPoints: Array<{ node: string; edges: GraphEdge[] }> = [];

    while (true) {
      const outs = outgoing.get(current) ?? [];
      const unvisited = outs.filter((e) => !visitedEdges.has(edgeKey(e)));

      if (unvisited.length === 0) break;

      // Take first edge for the chain
      const edge = unvisited[0];
      if (!edge) break;

      visitedEdges.add(edgeKey(edge));
      trackNode(edge.target);
      line += ` --${edge.type}--> ${getDisplayName(edge.target)}`;

      // If there are more unvisited edges, save as branch points
      if (unvisited.length > 1) {
        branchPoints.push({
          node: current,
          edges: unvisited.slice(1),
        });
      }

      current = edge.target;
    }

    lines.push(line);

    // Process branch points
    for (const branch of branchPoints) {
      for (const edge of branch.edges) {
        if (visitedEdges.has(edgeKey(edge))) continue;
        visitedEdges.add(edgeKey(edge));

        // Start new line from branch point
        const branchName = getDisplayName(branch.node);
        const targetName = getDisplayName(edge.target);

        // Check if target has more edges to form a chain
        const targetOuts = (outgoing.get(edge.target) ?? []).filter(
          (e) => !visitedEdges.has(edgeKey(e)),
        );

        if (targetOuts.length > 0) {
          // Build chain from this branch
          trackNode(edge.target);
          let branchLine = `${branchName} --${edge.type}--> ${targetName}`;
          let branchCurrent = edge.target;

          while (true) {
            const outs = outgoing.get(branchCurrent) ?? [];
            const unvisited = outs.filter((e) => !visitedEdges.has(edgeKey(e)));
            if (unvisited.length === 0) break;

            const nextEdge = unvisited[0];
            if (!nextEdge) break;

            visitedEdges.add(edgeKey(nextEdge));
            trackNode(nextEdge.target);
            branchLine += ` --${nextEdge.type}--> ${getDisplayName(nextEdge.target)}`;
            branchCurrent = nextEdge.target;
          }

          lines.push(branchLine);
        } else {
          trackNode(edge.target);
          lines.push(`${branchName} --${edge.type}--> ${targetName}`);
        }
      }
    }
  };

  // Build chains from each root
  for (const root of roots) {
    const outs = outgoing.get(root) ?? [];
    if (outs.some((e) => !visitedEdges.has(edgeKey(e)))) {
      buildChain(root);
    }
  }

  // Process any remaining unvisited nodes (handles disconnected cycles)
  for (const nodeId of allNodeIds) {
    if (!visitedNodes.has(nodeId)) {
      const outs = outgoing.get(nodeId) ?? [];
      if (outs.some((e) => !visitedEdges.has(edgeKey(e)))) {
        buildChain(nodeId);
      } else {
        // Node has no unvisited outgoing edges, just track it
        trackNode(nodeId);
      }
    }
  }

  return { text: lines.join("\n"), nodeOrder };
};
