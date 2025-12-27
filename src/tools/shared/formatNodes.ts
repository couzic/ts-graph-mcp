import { join } from "node:path";
import {
  computeContextLines,
  getAdaptiveMessage,
  MAX_NODES,
} from "./adaptiveSnippets.js";
import {
  extractFunctionBody,
  extractLOCs,
  type LOC,
} from "./extractSnippet.js";
import type { NodeInfo } from "./GraphTypes.js";

/**
 * Result of formatting the Nodes section.
 */
export interface FormatNodesResult {
  /** Formatted nodes text */
  text: string;
  /** Optional message about truncation/snippet omission */
  message?: string;
  /** Order of node IDs as they appear in output */
  nodeOrder: string[];
}

/**
 * Render LOC array with gap detection.
 *
 * When consecutive LOCs have non-adjacent line numbers,
 * inserts "... N lines omitted ..." between them.
 */
const renderLOCs = (locs: LOC[]): string[] => {
  const lines: string[] = [];
  let prevLine = 0;

  for (const loc of locs) {
    // Check for gap from previous LOC
    if (prevLine > 0) {
      const gap = loc.line - prevLine - 1;
      if (gap > 0) {
        lines.push(`    ... ${gap} lines omitted ...`);
      }
    }

    lines.push(`    ${loc.line}: ${loc.code}`);
    prevLine = loc.line;
  }

  return lines;
};

/**
 * Format the Nodes section of the output with adaptive snippets.
 *
 * Rules:
 * - Excludes query input nodes (passed in excludeIds)
 * - Shows file, offset, limit for Read tool compatibility
 * - Snippet context scales with node count (see adaptiveSnippets.ts)
 * - Truncates node list if exceeds MAX_NODES
 * - Orders nodes by appearance in Graph section (if nodeOrder provided)
 *
 * @param nodes - All nodes to potentially include
 * @param displayNames - Map of nodeId → display name (for ordering/labeling)
 * @param projectRoot - Project root for reading source files
 * @param excludeIds - Node IDs to exclude (query inputs)
 * @param nodeOrder - Optional order of node IDs (from formatGraph traversal)
 * @returns Formatted Nodes section with optional message
 */
export const formatNodes = (
  nodes: NodeInfo[],
  displayNames: Map<string, string>,
  projectRoot: string,
  excludeIds: Set<string>,
  nodeOrder?: string[],
): FormatNodesResult => {
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

  if (included.length === 0) {
    return { text: "", nodeOrder: [] };
  }

  // Get adaptive message before potential truncation
  const originalCount = included.length;
  const message = getAdaptiveMessage(originalCount);

  // Truncate if exceeds MAX_NODES
  if (included.length > MAX_NODES) {
    included = included.slice(0, MAX_NODES);
  }

  // Compute context lines based on original count
  const contextLines = computeContextLines(originalCount);

  const lines: string[] = [];
  const outputNodeOrder: string[] = [];

  for (const node of included) {
    const displayName = displayNames.get(node.id) || node.name;
    const limit = node.endLine - node.startLine + 1;

    outputNodeOrder.push(node.id);
    lines.push(`${displayName}:`);
    lines.push(`  file: ${node.filePath}`);
    lines.push(`  offset: ${node.startLine}, limit: ${limit}`);

    // Include snippets if contextLines is not null
    if (contextLines !== null) {
      const absolutePath = join(projectRoot, node.filePath);
      const functionLines = node.endLine - node.startLine + 1;

      // Use call sites only if function is large enough for context to be meaningful.
      // For small functions where context would exceed function boundaries,
      // just show the whole function body.
      const useCallSites =
        node.callSites &&
        node.callSites.length > 0 &&
        functionLines > contextLines * 2;

      let locs: LOC[];

      if (useCallSites && node.callSites) {
        locs = extractLOCs(absolutePath, node.callSites, contextLines);
      } else {
        // Small function or no call sites - show function body
        locs = extractFunctionBody(absolutePath, node.startLine, node.endLine);
      }

      if (locs.length > 0) {
        lines.push("  snippet:");
        lines.push(...renderLOCs(locs));
      }
    }

    lines.push(""); // Blank line between nodes
  }

  return {
    text: lines.join("\n"),
    message,
    nodeOrder: outputNodeOrder,
  };
};
