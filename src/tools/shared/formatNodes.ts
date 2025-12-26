import { join } from "node:path";
import { extractFunctionBody } from "./extractSnippet.js";
import type { NodeInfo } from "./GraphTypes.js";

/** Threshold for including snippets (above this, omit snippets) */
const SNIPPET_THRESHOLD = 15;

/**
 * Format the Nodes section of the output.
 *
 * Rules:
 * - Excludes query input nodes (passed in excludeIds)
 * - Shows file, offset, limit for Read tool compatibility
 * - Includes snippets when <= SNIPPET_THRESHOLD nodes
 * - Orders nodes by appearance in Graph section (if nodeOrder provided)
 *
 * @param nodes - All nodes to potentially include
 * @param displayNames - Map of nodeId → display name (for ordering/labeling)
 * @param projectRoot - Project root for reading source files
 * @param excludeIds - Node IDs to exclude (query inputs)
 * @param nodeOrder - Optional order of node IDs (from formatGraph traversal)
 * @returns Formatted Nodes section string
 */
export const formatNodes = (
  nodes: NodeInfo[],
  displayNames: Map<string, string>,
  projectRoot: string,
  excludeIds: Set<string>,
  nodeOrder?: string[],
): string => {
  // Filter out excluded nodes
  let included = nodes.filter((n) => !excludeIds.has(n.id));

  // Sort by graph appearance order if provided
  if (nodeOrder && nodeOrder.length > 0) {
    const orderIndex = new Map(nodeOrder.map((id, i) => [id, i]));
    included = included.sort((a, b) => {
      const aIdx = orderIndex.get(a.id) ?? Number.MAX_SAFE_INTEGER;
      const bIdx = orderIndex.get(b.id) ?? Number.MAX_SAFE_INTEGER;
      return aIdx - bIdx;
    });
  }

  if (included.length === 0) return "";

  const includeSnippets = included.length <= SNIPPET_THRESHOLD;

  const lines: string[] = [];

  for (const node of included) {
    const displayName = displayNames.get(node.id) || node.name;
    const limit = node.endLine - node.startLine + 1;

    lines.push(`${displayName}:`);
    lines.push(`  file: ${node.filePath}`);
    lines.push(`  offset: ${node.startLine}, limit: ${limit}`);

    if (includeSnippets) {
      const absolutePath = join(projectRoot, node.filePath);
      const snippet = extractFunctionBody(
        absolutePath,
        node.startLine,
        node.endLine,
      );

      if (snippet) {
        lines.push(`  snippet:`);
        // Format snippet with line numbers
        const codeLines = snippet.code.split("\n");
        for (let i = 0; i < codeLines.length; i++) {
          const lineNum = snippet.startLine + i;
          lines.push(`    ${lineNum}: ${codeLines[i]}`);
        }
      }
    }

    lines.push(""); // Blank line between nodes
  }

  return lines.join("\n");
};
