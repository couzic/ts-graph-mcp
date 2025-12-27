import type { CallSiteRange } from "../../db/Types.js";
import type { LOC } from "./GraphTypes.js";

/** Gaps of this size or smaller are filled in (showing actual lines) */
const SMALL_GAP_THRESHOLD = 2;

export interface ExtractSnippetInput {
  lines: string[];
  startLine: number;
  endLine: number;
  callSites?: CallSiteRange[];
  contextLines: number;
}

/**
 * Extract a code snippet from source lines.
 *
 * Strategy:
 * - Small functions or no call sites: return entire function body
 * - Large functions with call sites: return context around call sites
 *
 * @returns Array of LOC with 1-indexed line numbers
 */
export const extractSnippet = (input: ExtractSnippetInput): LOC[] => {
  const { lines, startLine, endLine, callSites, contextLines } = input;
  const functionLines = endLine - startLine + 1;

  // Use call sites only if function is large enough for context to be meaningful
  const useCallSites =
    callSites && callSites.length > 0 && functionLines > contextLines * 2;

  if (useCallSites) {
    return extractLOCsAroundCallSites(lines, callSites, contextLines);
  }
  return extractLineRange(lines, startLine, endLine);
};

/**
 * Extract lines of code around call sites.
 */
const extractLOCsAroundCallSites = (
  lines: string[],
  callSites: CallSiteRange[],
  contextLines: number,
): LOC[] => {
  const totalLines = lines.length;

  // Compute which lines to keep
  const keepSet = new Set<number>();
  for (const site of callSites) {
    const rangeStart = Math.max(1, site.start - contextLines);
    const rangeEnd = Math.min(totalLines, site.end + contextLines);
    for (let line = rangeStart; line <= rangeEnd; line++) {
      keepSet.add(line);
    }
  }

  // Fill small gaps (≤ SMALL_GAP_THRESHOLD lines) between kept ranges
  const sortedLines = [...keepSet].sort((a, b) => a - b);
  for (let i = 1; i < sortedLines.length; i++) {
    // biome-ignore lint/style/noNonNullAssertion: Unit tested
    const prevLine = sortedLines[i - 1]!;
    // biome-ignore lint/style/noNonNullAssertion: Unit tested
    const currLine = sortedLines[i]!;
    const gap = currLine - prevLine - 1;
    if (gap > 0 && gap <= SMALL_GAP_THRESHOLD) {
      for (let line = prevLine + 1; line < currLine; line++) {
        keepSet.add(line);
      }
    }
  }

  // Filter and build LOC[]
  const locs: LOC[] = [];
  for (const [i, code] of lines.entries()) {
    const lineNum = i + 1; // 1-indexed
    if (keepSet.has(lineNum)) {
      locs.push({ line: lineNum, code });
    }
  }

  return locs;
};

/**
 * Extract a range of lines as LOC[].
 */
const extractLineRange = (
  lines: string[],
  startLine: number,
  endLine: number,
): LOC[] => {
  const locs: LOC[] = [];
  for (const [i, code] of lines.entries()) {
    const lineNum = i + 1; // 1-indexed
    if (lineNum >= startLine && lineNum <= endLine) {
      locs.push({ line: lineNum, code });
    }
  }
  return locs;
};
