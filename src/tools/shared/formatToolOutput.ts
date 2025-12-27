import type { CallSiteRange } from "../../db/Types.js";
import { buildDisplayNames } from "./buildDisplayNames.js";
import { formatGraph } from "./formatGraph.js";
import { formatNodes } from "./formatNodes.js";
import type { GraphEdge, NodeInfo } from "./GraphTypes.js";

/**
 * Edge with optional call site information.
 */
export interface EdgeWithCallSites extends GraphEdge {
  callSites?: CallSiteRange[];
}

/**
 * Input for the pure formatting core.
 */
export interface FormatInput {
  /** Edges in the result graph (may include callSites for marker rendering) */
  edges: EdgeWithCallSites[];
  /** Nodes with locs pre-loaded (via loadNodeSnippets) */
  nodes: NodeInfo[];
  /** Node IDs to exclude from Nodes section (query inputs) */
  excludeNodeIds: Set<string>;
}

/**
 * Format tool output from edges and nodes.
 *
 * This is the pure core of all MCP tools. It takes pre-processed
 * data (edges from DB, nodes with snippets loaded) and returns
 * the formatted output string.
 *
 * Flow:
 * 1. Enrich nodes with call site information from edges
 * 2. Build disambiguated display names
 * 3. Format Graph section (chain-compacted)
 * 4. Format Nodes section (with snippets if locs present)
 * 5. Assemble final output
 *
 * @param input - Edges, nodes, and exclusion set
 * @returns Formatted output string (Graph + Nodes sections)
 */
export const formatToolOutput = (input: FormatInput): string => {
  const { edges, nodes, excludeNodeIds } = input;

  // 1. Enrich nodes with call site information from edges
  const enrichedNodes = enrichNodesWithCallSites(nodes, edges);

  // 2. Collect all node IDs for display name generation
  const allNodeIds = new Set<string>();
  for (const edge of edges) {
    allNodeIds.add(edge.source);
    allNodeIds.add(edge.target);
  }
  const displayNames = buildDisplayNames([...allNodeIds]);

  // 3. Format graph section
  const { text: graphSection, nodeOrder } = formatGraph(edges);

  // 4. Format nodes section
  const nodesResult = formatNodes(
    enrichedNodes,
    displayNames,
    excludeNodeIds,
    nodeOrder,
  );

  // 5. Assemble output
  if (nodesResult.text.trim() === "") {
    return `## Graph\n\n${graphSection}`;
  }

  let output = `## Graph\n\n${graphSection}\n\n## Nodes\n\n${nodesResult.text}`;
  if (nodesResult.message) {
    output += `\n${nodesResult.message}`;
  }

  return output;
};

/**
 * Enrich nodes with call site information extracted from edges.
 * Call sites belong to the SOURCE node (the caller), not the target.
 */
const enrichNodesWithCallSites = (
  nodes: NodeInfo[],
  edges: EdgeWithCallSites[],
): NodeInfo[] => {
  const callSitesByNode = new Map<string, CallSiteRange[]>();

  for (const edge of edges) {
    if (edge.callSites && edge.callSites.length > 0) {
      const existing = callSitesByNode.get(edge.source) ?? [];
      existing.push(...edge.callSites);
      callSitesByNode.set(edge.source, existing);
    }
  }

  return nodes.map((node) => ({
    ...node,
    callSites: callSitesByNode.get(node.id),
  }));
};
