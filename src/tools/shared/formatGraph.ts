import type { GraphEdge } from "./GraphTypes.js";

/**
 * Extract symbol name from node ID.
 * "src/utils.ts:formatDate" → "formatDate"
 * "src/models/User.ts:User.save" → "User.save"
 */
export const extractSymbol = (nodeId: string): string => {
  const colonIndex = nodeId.indexOf(":");
  if (colonIndex === -1) return nodeId;
  return nodeId.slice(colonIndex + 1);
};

/**
 * Build display name map, handling disambiguation when names collide.
 * Returns: Map<nodeId, displayName>
 *
 * When multiple nodes share the same name, they get #1, #2 suffixes.
 */
export const buildDisplayNames = (nodeIds: string[]): Map<string, string> => {
  const displayNames = new Map<string, string>();
  const nameCount = new Map<string, string[]>(); // name → [nodeId, ...]

  // First pass: count names
  for (const nodeId of nodeIds) {
    const name = extractSymbol(nodeId);
    const existing = nameCount.get(name);
    if (existing) {
      existing.push(nodeId);
    } else {
      nameCount.set(name, [nodeId]);
    }
  }

  // Second pass: assign display names
  for (const [name, ids] of nameCount) {
    if (ids.length === 1 && ids[0] !== undefined) {
      // Unique name - use as-is
      displayNames.set(ids[0], name);
    } else {
      // Ambiguous - add #N suffix
      ids.forEach((id, index) => {
        displayNames.set(id, `${name}#${index + 1}`);
      });
    }
  }

  return displayNames;
};

/**
 * Format edges into chain-compacted Graph section.
 *
 * Rules:
 * - Linear chains on single line: A --CALLS--> B --CALLS--> C
 * - Branch points start new lines
 * - Uses symbol names, not full IDs
 * - Disambiguates with #N when names collide
 *
 * @returns Multi-line string for the Graph section
 */
export const formatGraph = (edges: GraphEdge[]): string => {
  if (edges.length === 0) return "";

  // Collect all node IDs
  const allNodeIds = new Set<string>();
  for (const edge of edges) {
    allNodeIds.add(edge.source);
    allNodeIds.add(edge.target);
  }

  // Build display names with disambiguation
  const displayNames = buildDisplayNames([...allNodeIds]);

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

  const edgeKey = (e: GraphEdge): string => `${e.source}|${e.target}|${e.type}`;

  const getDisplayName = (nodeId: string): string =>
    displayNames.get(nodeId) ?? extractSymbol(nodeId);

  const buildChain = (startNode: string): void => {
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
          let branchLine = `${branchName} --${edge.type}--> ${targetName}`;
          let branchCurrent = edge.target;

          while (true) {
            const outs = outgoing.get(branchCurrent) ?? [];
            const unvisited = outs.filter((e) => !visitedEdges.has(edgeKey(e)));
            if (unvisited.length === 0) break;

            const nextEdge = unvisited[0];
            if (!nextEdge) break;

            visitedEdges.add(edgeKey(nextEdge));
            branchLine += ` --${nextEdge.type}--> ${getDisplayName(nextEdge.target)}`;
            branchCurrent = nextEdge.target;
          }

          lines.push(branchLine);
        } else {
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

  return lines.join("\n");
};
