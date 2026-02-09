import type { OutputFormat } from "@ts-graph/shared";
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
 *
 * @example
 * const result = dependenciesData(db, filePath, symbol);
 * const mermaid = formatMermaidFromResult(result);
 */
export const formatMermaidFromResult = (result: QueryResult): string => {
  const { edges, metadataByNodeId, aliasMap, maxNodes, message } = result;

  if (edges.length === 0) {
    return message ?? "graph LR\n  empty[No data]";
  }

  const output = formatMermaid(edges, {
    maxNodes,
    metadataByNodeId,
    aliasMap,
  });

  return message ? `${message}\n\n${output}` : output;
};

/**
 * Format a QueryResult using the specified output format.
 *
 * @example
 * const result = dependenciesData(db, filePath, symbol);
 * return formatQueryResult(result, options.format);
 */
export const formatQueryResult = (
  result: QueryResult,
  format?: OutputFormat,
): string => {
  if (format === "mermaid") {
    return formatMermaidFromResult(result);
  }
  return formatMcpFromResult(result);
};
