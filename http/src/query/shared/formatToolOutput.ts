import type { CallSiteRange } from "../../db/Types.js";
import { buildDisplayNames } from "./buildDisplayNames.js";
import { formatGraph } from "./formatGraph.js";
import { formatNodes } from "./formatNodes.js";
import type { GraphEdge, NodeInfo } from "./GraphTypes.js";

/** Default maximum nodes before truncation */
const DEFAULT_MAX_NODES = 50;

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
  /** Maximum nodes before truncation (default: 50) */
  maxNodes?: number;
}

/**
 * Format tool output from edges and nodes.
 *
 * This is the pure core of all MCP tools. It takes pre-processed
 * data (edges from DB, nodes with snippets loaded) and returns
 * the formatted output string.
 *
 * Flow:
 * 1. Count unique nodes and check against maxNodes limit
 * 2. If over limit: truncate graph (BFS order), skip Nodes section
 * 3. If under limit: format full Graph + Nodes sections
 *
 * @param input - Edges, nodes, exclusion set, and optional maxNodes limit
 * @returns Formatted output string (Graph + optionally Nodes sections)
 */
export const formatToolOutput = (input: FormatInput): string => {
  const { edges, nodes, excludeNodeIds, maxNodes = DEFAULT_MAX_NODES } = input;

  // Count unique nodes in the graph
  const allNodeIds = new Set<string>();
  for (const edge of edges) {
    allNodeIds.add(edge.source);
    allNodeIds.add(edge.target);
  }
  const totalNodeCount = allNodeIds.size;

  // Check if truncation is needed
  if (totalNodeCount > maxNodes) {
    return formatTruncatedOutput(edges, totalNodeCount, maxNodes);
  }

  // Full output path (under limit)
  return formatFullOutput(edges, nodes, excludeNodeIds);
};

/**
 * Format full output with Graph and Nodes sections.
 */
const formatFullOutput = (
  edges: EdgeWithCallSites[],
  nodes: NodeInfo[],
  excludeNodeIds: Set<string>,
): string => {
  // Enrich nodes with call site information
  const enrichedNodes = enrichNodesWithCallSites(nodes, edges);

  // Collect all node IDs for display name generation
  const allNodeIds = new Set<string>();
  for (const edge of edges) {
    allNodeIds.add(edge.source);
    allNodeIds.add(edge.target);
  }
  const displayNames = buildDisplayNames([...allNodeIds]);

  // Format graph section
  const { text: graphSection, nodeOrder } = formatGraph(edges);

  // Format nodes section
  const nodesResult = formatNodes(
    enrichedNodes,
    displayNames,
    excludeNodeIds,
    nodeOrder,
  );

  // Assemble output
  if (nodesResult.text.trim() === "") {
    return `## Graph\n\n${graphSection}`;
  }

  return `## Graph\n\n${graphSection}\n\n## Nodes\n\n${nodesResult.text}`;
};

/**
 * Format truncated output with Graph section only.
 * Truncates to first maxNodes nodes in BFS traversal order.
 */
const formatTruncatedOutput = (
  edges: EdgeWithCallSites[],
  totalNodeCount: number,
  maxNodes: number,
): string => {
  // First pass: get node traversal order from formatGraph
  const { nodeOrder } = formatGraph(edges);

  // Keep only first maxNodes nodes
  const keptNodes = new Set(nodeOrder.slice(0, maxNodes));

  // Filter edges to only those where both endpoints are in kept set
  const truncatedEdges = edges.filter(
    (e) => keptNodes.has(e.source) && keptNodes.has(e.target),
  );

  // Format truncated graph
  const { text: graphSection } = formatGraph(truncatedEdges);

  // Build output with truncation message
  const message = `(${totalNodeCount} nodes total — Nodes section skipped. Use max_nodes param for full details.)`;

  return `## Graph\n\n${graphSection}\n\n${message}`;
};

/**
 * Enrich nodes with call site information extracted from edges.
 * Call sites belong to the SOURCE node (the caller), not the target.
 *
 * IMPORTANT: Must be called BEFORE loadNodeSnippets so that
 * extractSnippet can truncate long functions around call sites.
 */
export const enrichNodesWithCallSites = (
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
