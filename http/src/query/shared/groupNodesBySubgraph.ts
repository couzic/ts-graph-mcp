import { extractFilePath } from "./extractFilePath.js";
import type { NodeMetadata } from "./queryNodeMetadata.js";

/**
 * Group node IDs into subgraph buckets by package (if multiple) or file.
 *
 * @example
 * groupNodesBySubgraph(
 *   new Set(["src/a.ts:Function:fnA", "src/a.ts:Function:fnB", "src/b.ts:Function:fnC"]),
 *   new Map()
 * )
 * // Map { "src/a.ts" => ["src/a.ts:Function:fnA", "src/a.ts:Function:fnB"], "src/b.ts" => ["src/b.ts:Function:fnC"] }
 */
export const groupNodesBySubgraph = (
  nodeIds: Set<string>,
  metadataByNodeId?: Map<string, NodeMetadata>,
): Map<string, string[]> => {
  // Determine grouping strategy: package (if multiple) or file (fallback)
  const uniquePackages = new Set<string>();
  if (metadataByNodeId) {
    for (const nodeId of nodeIds) {
      const meta = metadataByNodeId.get(nodeId);
      if (meta) {
        uniquePackages.add(meta.package);
      }
    }
  }
  const usePackageGrouping = uniquePackages.size > 1;

  // Group nodes by package or file
  const nodesByGroup = new Map<string, string[]>();
  for (const nodeId of nodeIds) {
    let groupKey: string;
    if (usePackageGrouping && metadataByNodeId) {
      groupKey =
        metadataByNodeId.get(nodeId)?.package ?? extractFilePath(nodeId);
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

  return nodesByGroup;
};
