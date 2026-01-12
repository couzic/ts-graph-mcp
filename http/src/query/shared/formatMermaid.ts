import { buildDisplayNames } from "./buildDisplayNames.js";
import { extractSymbol } from "./extractSymbol.js";
import type { GraphEdge } from "./GraphTypes.js";

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
export const formatMermaid = (edges: GraphEdge[]): string => {
  if (edges.length === 0) {
    return "graph LR\n  empty[No data]";
  }

  // Collect all node IDs
  const allNodeIds = new Set<string>();
  for (const edge of edges) {
    allNodeIds.add(edge.source);
    allNodeIds.add(edge.target);
  }

  // Build display names with disambiguation
  const displayNames = buildDisplayNames([...allNodeIds]);

  const getDisplayName = (nodeId: string): string =>
    displayNames.get(nodeId) ?? extractSymbol(nodeId);

  // Mermaid requires valid identifiers - replace special chars
  const sanitizeId = (name: string): string =>
    name.replace(/[^a-zA-Z0-9_]/g, "_");

  // Build node ID to sanitized ID map
  const nodeIdMap = new Map<string, string>();
  let idCounter = 0;
  for (const nodeId of allNodeIds) {
    const displayName = getDisplayName(nodeId);
    const sanitized = sanitizeId(displayName);
    // Add counter suffix to ensure uniqueness
    nodeIdMap.set(nodeId, `${sanitized}_${idCounter++}`);
  }

  const lines: string[] = ["graph LR"];

  // Add node definitions with display labels
  for (const nodeId of allNodeIds) {
    const sanitizedId = nodeIdMap.get(nodeId);
    const displayName = getDisplayName(nodeId);
    lines.push(`  ${sanitizedId}["${displayName}"]`);
  }

  // Add edges
  for (const edge of edges) {
    const sourceId = nodeIdMap.get(edge.source);
    const targetId = nodeIdMap.get(edge.target);
    lines.push(`  ${sourceId} -->|${edge.type}| ${targetId}`);
  }

  return lines.join("\n");
};
