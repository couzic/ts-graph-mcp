import { readFileSync } from "node:fs";
import { join } from "node:path";
import { computeContextLines } from "./computeContextLines.js";
import { extractSnippet } from "./extractSnippet.js";
import type { NodeInfo } from "./GraphTypes.js";

/**
 * Load code snippets for nodes (I/O boundary).
 */
export const loadNodeSnippets = (
  nodes: NodeInfo[],
  projectRoot: string,
  originalNodeCount: number,
): NodeInfo[] => {
  const contextLines = computeContextLines(originalNodeCount);
  if (contextLines === null) return nodes;

  return nodes.map((node) => {
    const lines = readLines(join(projectRoot, node.filePath));
    if (!lines) return node;

    const locs = extractSnippet({
      lines,
      startLine: node.startLine,
      endLine: node.endLine,
      callSites: node.callSites ?? [],
      contextLines,
    });

    return { ...node, locs };
  });
};

const readLines = (filePath: string): string[] | null => {
  try {
    return readFileSync(filePath, "utf-8").split("\n");
  } catch {
    return null;
  }
};
