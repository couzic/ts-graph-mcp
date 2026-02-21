import { formatMermaid } from "./formatMermaid.js";
import {
  enrichNodesWithCallSites,
  formatToolOutput,
} from "./formatToolOutput.js";
import { loadNodeSnippets } from "./loadNodeSnippets.js";
import type { QueryResult } from "./QueryResult.js";

/**
 * Format a QueryResult as MCP text output (Graph + Nodes sections).
 *
 * @example
 * const result = dependenciesData(db, filePath, symbol);
 * const text = formatMcpFromResult(result);
 */
export const formatMcpFromResult = (result: QueryResult): string => {
  const { edges, nodes, aliasMap, maxNodes, message } = result;

  if (edges.length === 0) {
    return message ?? "";
  }

  const enrichedNodes = enrichNodesWithCallSites(nodes, edges);
  const nodesWithSnippets = loadNodeSnippets(enrichedNodes, nodes.length);

  const output = formatToolOutput({
    edges,
    nodes: nodesWithSnippets,
    maxNodes,
    aliasMap,
  });

  return message ? `${message}\n\n${output}` : output;
};

/**
 * Format a QueryResult as Mermaid diagram syntax.
 * Returns one string per connected component.
 *
 * @example
 * const result = dependenciesData(db, filePath, symbol);
 * const diagrams = formatMermaidFromResult(result);
 * // diagrams: string[] — one mermaid graph per connected component
 */
export const formatMermaidFromResult = (
  result: QueryResult,
  direction?: "LR" | "TD",
): string[] => {
  const { edges, metadataByNodeId, aliasMap, maxNodes, message } = result;

  if (edges.length === 0) {
    const dir = direction ?? "LR";
    return [message ?? `graph ${dir}\n  empty[No data]`];
  }

  const diagrams = formatMermaid(edges, {
    maxNodes,
    metadataByNodeId,
    aliasMap,
    direction,
  });

  if (message && diagrams.length > 0) {
    diagrams[0] = `${message}\n\n${diagrams[0]}`;
  }

  return diagrams;
};
