import { computeContextLines } from "./computeContextLines.js";
import { extractSnippet } from "./extractSnippet.js";
import type { NodeInfo } from "./GraphTypes.js";

/**
 * Load code snippets for nodes, extracting the relevant lines with context.
 */
export const loadNodeSnippets = (
  nodes: NodeInfo[],
  originalNodeCount: number,
): NodeInfo[] => {
  const contextLines = computeContextLines(originalNodeCount);
  if (contextLines === null) return nodes;

  return nodes.map((node) => {
    const snippetLines = node.snippet.split("\n");
    const padding = new Array(node.startLine - 1).fill("");
    const lines = [...padding, ...snippetLines];

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
