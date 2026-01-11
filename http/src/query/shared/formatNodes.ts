import type { CallSiteRange } from "../../db/Types.js";
import type { LOC, NodeInfo } from "./GraphTypes.js";

/**
 * Result of formatting the Nodes section.
 */
export interface FormatNodesResult {
  /** Formatted nodes text */
  text: string;
  /** Order of node IDs as they appear in output */
  nodeOrder: string[];
}

/**
 * Check if a line number falls within any call site range.
 */
const isCallSiteLine = (lineNum: number, callSites: CallSiteRange[]): boolean =>
  callSites.some((site) => lineNum >= site.start && lineNum <= site.end);

/**
 * Render LOC array with gap detection and call site markers.
 *
 * When consecutive LOCs have non-adjacent line numbers,
 * inserts "... N lines omitted ..." between them.
 *
 * Lines that are call sites are prefixed with "> " to help
 * AI agents identify the relevant line.
 */
const renderLOCs = (locs: LOC[], callSites?: CallSiteRange[]): string[] => {
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

    // Use "> " prefix for call site lines, otherwise 4 spaces
    const prefix =
      callSites && isCallSiteLine(loc.line, callSites) ? "  > " : "    ";
    lines.push(`${prefix}${loc.line}: ${loc.code}`);
    prevLine = loc.line;
  }

  return lines;
};

/**
 * Format the Nodes section of the output.
 *
 * This is a pure function - all I/O (file reading) must be done
 * beforehand by populating node.locs via loadNodeSnippets().
 *
 * Truncation is handled by formatToolOutput - this function formats
 * all nodes it receives without truncation.
 *
 * Rules:
 * - Excludes query input nodes (passed in excludeIds)
 * - Shows file, offset, limit for Read tool compatibility
 * - Renders snippets from node.locs if present
 * - Orders nodes by appearance in Graph section (if nodeOrder provided)
 *
 * @param nodes - All nodes (with locs pre-loaded if snippets desired)
 * @param displayNames - Map of nodeId → display name
 * @param excludeIds - Node IDs to exclude (query inputs)
 * @param nodeOrder - Optional order of node IDs (from formatGraph traversal)
 * @returns Formatted Nodes section
 */
export const formatNodes = (
  nodes: NodeInfo[],
  displayNames: Map<string, string>,
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

  const lines: string[] = [];
  const outputNodeOrder: string[] = [];

  for (const node of included) {
    const displayName = displayNames.get(node.id) || node.name;
    const limit = node.endLine - node.startLine + 1;

    outputNodeOrder.push(node.id);
    lines.push(`${displayName}:`);
    lines.push(`  type: ${node.type}`);
    lines.push(`  file: ${node.filePath}`);
    lines.push(`  offset: ${node.startLine}, limit: ${limit}`);

    // Render snippet if locs were pre-loaded
    if (node.locs && node.locs.length > 0) {
      lines.push("  snippet:");
      lines.push(...renderLOCs(node.locs, node.callSites));
    }

    lines.push(""); // Blank line between nodes
  }

  return {
    text: lines.join("\n"),
    nodeOrder: outputNodeOrder,
  };
};
