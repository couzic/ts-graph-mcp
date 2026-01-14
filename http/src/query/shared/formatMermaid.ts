import type { NodeType } from "../../db/Types.js";
import { buildDisplayNames } from "./buildDisplayNames.js";
import { extractFilePath } from "./extractFilePath.js";
import { extractSymbol } from "./extractSymbol.js";
import {
  formatDisplayName,
  type DisplayNameContext,
} from "./formatDisplayName.js";
import { DEFAULT_MAX_NODES, truncateEdges } from "./formatToolOutput.js";
import type { GraphEdge } from "./GraphTypes.js";
import type { NodeMetadata } from "./queryNodeMetadata.js";

export type MermaidOptions = {
  maxNodes?: number;
  metadataByNodeId?: Map<string, NodeMetadata>;
};

/**
 * Format edges into mermaid flowchart syntax.
 *
 * @example
 * // Input edges: A --CALLS--> B, B --CALLS--> C
 * // Output:
 * // graph LR
 * //   A -->|CALLS| B
 * //   B -->|CALLS| C
 */
export const formatMermaid = (
  edges: GraphEdge[],
  options?: MermaidOptions,
): string => {
  if (edges.length === 0) {
    return "graph LR\n  empty[No data]";
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
  let truncationComment = "";

  if (totalNodeCount > maxNodes) {
    const { truncatedEdges } = truncateEdges(edges, maxNodes);
    workingEdges = truncatedEdges;
    truncationComment = `%% (${maxNodes}/${totalNodeCount} nodes displayed)\n`;
  }

  // Collect node IDs from working edges
  const workingNodeIds = new Set<string>();
  for (const edge of workingEdges) {
    workingNodeIds.add(edge.source);
    workingNodeIds.add(edge.target);
  }

  // Build display names with disambiguation
  const displayNames = buildDisplayNames([...workingNodeIds]);

  // Build context for type-aware display names
  const includesTargets = new Set<string>();
  for (const edge of workingEdges) {
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
    return formatDisplayName(nodeId, baseName, displayContext);
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
    // Add counter suffix to ensure uniqueness
    nodeIdMap.set(nodeId, `${sanitized}_${idCounter++}`);
  }

  const lines: string[] = [truncationComment + "graph LR"];

  // Determine grouping strategy: package (if multiple) or file (fallback)
  const uniquePackages = new Set<string>();
  if (metadataByNodeId) {
    for (const nodeId of workingNodeIds) {
      const meta = metadataByNodeId.get(nodeId);
      if (meta) {
        uniquePackages.add(meta.package);
      }
    }
  }
  const usePackageGrouping = uniquePackages.size > 1;

  // Group nodes by package or file
  const nodesByGroup = new Map<string, string[]>();
  for (const nodeId of workingNodeIds) {
    let groupKey: string;
    if (usePackageGrouping && metadataByNodeId) {
      groupKey = metadataByNodeId.get(nodeId)?.package ?? extractFilePath(nodeId);
    } else {
      groupKey = extractFilePath(nodeId);
    }
    const existing = nodesByGroup.get(groupKey);
    if (existing) {
      existing.push(nodeId);
    } else {
      nodesByGroup.set(groupKey, [nodeId]);
    }
  }

  // Add subgraphs with node definitions
  // Only wrap in subgraph if group has 2+ symbols
  let subgraphCounter = 0;
  for (const [groupKey, nodeIds] of nodesByGroup) {
    const useSubgraph = nodeIds.length > 1;
    if (useSubgraph) {
      const subgraphId = `sg_${subgraphCounter++}`;
      lines.push(`  subgraph ${subgraphId}["${groupKey}"]`);
    }
    for (const nodeId of nodeIds) {
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
  for (const edge of workingEdges) {
    const sourceId = nodeIdMap.get(edge.source);
    const targetId = nodeIdMap.get(edge.target);
    lines.push(`  ${sourceId} -->|${edge.type}| ${targetId}`);
  }

  return lines.join("\n");
};
