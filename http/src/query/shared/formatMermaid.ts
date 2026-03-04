import type { NodeType } from "@ts-graph/shared";
import { buildAliasMap } from "./buildAliasMap.js";
import { buildDisplayNames } from "./buildDisplayNames.js";
import { extractSymbol } from "./extractSymbol.js";
import {
  type DisplayNameContext,
  formatDisplayName,
} from "./formatDisplayName.js";
import { DEFAULT_MAX_NODES, truncateEdges } from "./formatToolOutput.js";
import type { GraphEdge } from "./GraphTypes.js";
import { groupNodesBySubgraph } from "./groupNodesBySubgraph.js";
import type { NodeMetadata } from "./queryNodeMetadata.js";

export type MermaidOptions = {
  maxNodes?: number;
  metadataByNodeId?: Map<string, NodeMetadata>;
  aliasMap?: Map<string, string>;
  direction?: "LR" | "TD";
};

/**
 * Find connected components in an undirected graph via BFS.
 *
 * @example
 * // Two disconnected edges: A→B, C→D
 * findConnectedComponents([{source:"A",target:"B",...}, {source:"C",target:"D",...}])
 * // Returns [[edge_AB], [edge_CD]]
 */
export const findConnectedComponents = (edges: GraphEdge[]): GraphEdge[][] => {
  // Build undirected adjacency list: node → edge objects touching that node
  const adjacency = new Map<string, GraphEdge[]>();
  for (const edge of edges) {
    const sourceAdj = adjacency.get(edge.source);
    if (sourceAdj) {
      sourceAdj.push(edge);
    } else {
      adjacency.set(edge.source, [edge]);
    }
    const targetAdj = adjacency.get(edge.target);
    if (targetAdj) {
      targetAdj.push(edge);
    } else {
      adjacency.set(edge.target, [edge]);
    }
  }

  const visitedNodes = new Set<string>();
  const visitedEdges = new Set<GraphEdge>();
  const components: GraphEdge[][] = [];

  for (const startNode of adjacency.keys()) {
    if (visitedNodes.has(startNode)) {
      continue;
    }

    const componentEdges: GraphEdge[] = [];
    const queue: string[] = [startNode];
    visitedNodes.add(startNode);

    while (queue.length > 0) {
      const node = queue.shift() as string;
      const nodeEdges = adjacency.get(node) ?? [];
      for (const edge of nodeEdges) {
        if (visitedEdges.has(edge)) {
          continue;
        }
        visitedEdges.add(edge);
        componentEdges.push(edge);
        const neighbor = edge.source === node ? edge.target : edge.source;
        if (!visitedNodes.has(neighbor)) {
          visitedNodes.add(neighbor);
          queue.push(neighbor);
        }
      }
    }

    if (componentEdges.length > 0) {
      components.push(componentEdges);
    }
  }

  return components;
};

/**
 * Format a single connected component's edges into mermaid flowchart syntax.
 * Uses globalGrouping (computed from ALL edges across components) to determine
 * which groups become subgraphs, ensuring consistent grouping across diagrams.
 */
const formatSingleGraph = (
  edges: GraphEdge[],
  globalGrouping: Map<string, string[]>,
  options?: MermaidOptions,
): string => {
  // Collect node IDs for this component
  const workingNodeIds = new Set<string>();
  for (const edge of edges) {
    workingNodeIds.add(edge.source);
    workingNodeIds.add(edge.target);
  }

  // Build display names with disambiguation
  const effectiveAliasMap = options?.aliasMap ?? buildAliasMap(edges);
  const displayNames = buildDisplayNames(
    [...workingNodeIds],
    effectiveAliasMap,
  );

  // Build context for type-aware display names
  const includesTargets = new Set<string>();
  for (const edge of edges) {
    if (edge.type === "INCLUDES") {
      includesTargets.add(edge.target);
    }
  }

  const metadataByNodeId = options?.metadataByNodeId;
  const typeByNodeId = new Map<string, NodeType>();
  if (metadataByNodeId) {
    for (const [nodeId, meta] of metadataByNodeId) {
      typeByNodeId.set(nodeId, meta.type);
    }
  }
  const displayContext: DisplayNameContext = {
    typeByNodeId,
    includesTargets,
  };

  const getDisplayName = (nodeId: string): string => {
    const baseName = displayNames.get(nodeId) ?? extractSymbol(nodeId);
    const name = formatDisplayName(nodeId, baseName, displayContext);
    return name.replace(/</g, "&lt;").replace(/>/g, "&gt;");
  };

  // Mermaid requires valid identifiers - replace special chars
  const sanitizeId = (name: string): string =>
    name.replace(/[^a-zA-Z0-9_]/g, "_");

  // Build node ID to sanitized ID map
  const nodeIdMap = new Map<string, string>();
  let idCounter = 0;
  for (const nodeId of workingNodeIds) {
    const displayName = getDisplayName(nodeId);
    const sanitized = sanitizeId(displayName);
    nodeIdMap.set(nodeId, `${sanitized}_${idCounter++}`);
  }

  // Build this component's groups, filtered from global grouping
  // A group is a subgraph if it has 2+ symbols GLOBALLY
  const componentGroups = new Map<string, string[]>();
  for (const [groupKey, globalNodeIds] of globalGrouping) {
    const localNodeIds = globalNodeIds.filter((id) => workingNodeIds.has(id));
    if (localNodeIds.length > 0) {
      componentGroups.set(groupKey, localNodeIds);
    }
  }

  // Check if any group is a subgraph (2+ symbols globally)
  let hasSubgraphs = false;
  for (const [groupKey] of componentGroups) {
    const globalSize = globalGrouping.get(groupKey)?.length ?? 0;
    if (globalSize > 1) {
      hasSubgraphs = true;
      break;
    }
  }

  const direction = options?.direction ?? (hasSubgraphs ? "TD" : "LR");
  const lines: string[] = [`graph ${direction}`];

  // Render nodes, wrapping in subgraph if the group has 2+ symbols globally
  let subgraphCounter = 0;
  for (const [groupKey, localNodeIds] of componentGroups) {
    const globalSize = globalGrouping.get(groupKey)?.length ?? 0;
    const useSubgraph = globalSize > 1;
    if (useSubgraph) {
      const subgraphId = `sg_${subgraphCounter++}`;
      lines.push(`  subgraph ${subgraphId}["${groupKey}"]`);
    }
    for (const nodeId of localNodeIds) {
      const sanitizedId = nodeIdMap.get(nodeId);
      const displayName = getDisplayName(nodeId);
      const indent = useSubgraph ? "    " : "  ";
      lines.push(`${indent}${sanitizedId}["${displayName}"]`);
    }
    if (useSubgraph) {
      lines.push("  end");
    }
  }

  // Add edges
  for (const edge of edges) {
    const sourceId = nodeIdMap.get(edge.source);
    const targetId = nodeIdMap.get(edge.target);
    lines.push(`  ${sourceId} -->|${edge.type}| ${targetId}`);
  }

  return lines.join("\n");
};

/**
 * Format edges into mermaid flowchart syntax.
 * Returns one string per connected component.
 *
 * @example
 * // Connected graph → single-element array
 * formatMermaid([{source:"A",target:"B",...}])
 * // ["graph LR\n  A -->|CALLS| B"]
 *
 * // Disconnected components → one element per component
 * formatMermaid([{source:"A",target:"B",...}, {source:"C",target:"D",...}])
 * // ["graph LR\n  A -->|CALLS| B", "graph LR\n  C -->|CALLS| D"]
 */
export const formatMermaid = (
  edges: GraphEdge[],
  options?: MermaidOptions,
): string[] => {
  if (edges.length === 0) {
    return [`graph ${options?.direction ?? "LR"}\n  empty[No data]`];
  }

  const maxNodes = options?.maxNodes ?? DEFAULT_MAX_NODES;

  // Count total nodes and apply truncation if needed
  const allNodeIds = new Set<string>();
  for (const edge of edges) {
    allNodeIds.add(edge.source);
    allNodeIds.add(edge.target);
  }
  const totalNodeCount = allNodeIds.size;

  let workingEdges = edges;

  if (totalNodeCount > maxNodes) {
    const { truncatedEdges } = truncateEdges(edges, maxNodes);
    workingEdges = truncatedEdges;
  }

  // Compute global grouping from ALL edges (before splitting into components)
  const allWorkingNodeIds = new Set<string>();
  for (const edge of workingEdges) {
    allWorkingNodeIds.add(edge.source);
    allWorkingNodeIds.add(edge.target);
  }
  const globalGrouping = groupNodesBySubgraph(
    allWorkingNodeIds,
    options?.metadataByNodeId,
  );

  // Split into connected components
  const components = findConnectedComponents(workingEdges);

  if (components.length === 0) {
    return [`graph ${options?.direction ?? "LR"}\n  empty[No data]`];
  }

  // Format each component as a separate mermaid diagram
  return components.map((componentEdges) =>
    formatSingleGraph(componentEdges, globalGrouping, options),
  );
};
