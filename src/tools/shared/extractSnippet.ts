import { readFileSync } from "node:fs";
import type { CallSiteRange } from "../../db/Types.js";

/**
 * A line of code with its line number.
 */
export interface LOC {
  line: number;
  code: string;
}

/**
 * Extract lines of code around call sites.
 *
 * Algorithm:
 * 1. Read file
 * 2. Compute which lines to keep (call sites + context)
 * 3. Filter to keep only those lines
 * 4. Return LOC[]
 *
 * The caller (formatNodes) detects gaps between consecutive LOCs
 * and renders "... N lines omitted ...".
 *
 * @param filePath - Absolute path to source file
 * @param callSites - Line ranges where calls occur (1-indexed)
 * @param contextLines - Lines of context before/after each call site
 * @returns Array of LOC, or empty array if file cannot be read
 */
export const extractLOCs = (
  filePath: string,
  callSites: CallSiteRange[],
  contextLines: number,
): LOC[] => {
  if (callSites.length === 0) {
    return [];
  }

  let content: string;
  try {
    content = readFileSync(filePath, "utf-8");
  } catch {
    return [];
  }

  const lines = content.split("\n");
  const totalLines = lines.length;

  // Step 1: Compute which lines to keep
  const keepSet = new Set<number>();
  for (const site of callSites) {
    const rangeStart = Math.max(1, site.start - contextLines);
    const rangeEnd = Math.min(totalLines, site.end + contextLines);
    for (let line = rangeStart; line <= rangeEnd; line++) {
      keepSet.add(line);
    }
  }

  // Step 2: Filter and build LOC[]
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
 * Extract the whole function body as LOC[].
 *
 * @param filePath - Absolute path to source file
 * @param startLine - Function start line (1-indexed)
 * @param endLine - Function end line (1-indexed)
 * @returns LOC[] for the function body, or empty array if file cannot be read
 */
export const extractFunctionBody = (
  filePath: string,
  startLine: number,
  endLine: number,
): LOC[] => {
  let content: string;
  try {
    content = readFileSync(filePath, "utf-8");
  } catch {
    return [];
  }

  const lines = content.split("\n");
  const locs: LOC[] = [];

  for (const [i, code] of lines.entries()) {
    const lineNum = i + 1; // 1-indexed
    if (lineNum >= startLine && lineNum <= endLine) {
      locs.push({ line: lineNum, code });
    }
  }

  return locs;
};
