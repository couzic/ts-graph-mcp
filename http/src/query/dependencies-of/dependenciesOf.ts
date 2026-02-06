import type Database from "better-sqlite3";
import {
  attemptClassMethodFallback,
  formatDisambiguationMessage,
} from "../shared/classMethodFallback.js";
import { collectNodeIds } from "../shared/collectNodeIds.js";
import { formatMermaid } from "../shared/formatMermaid.js";
import {
  enrichNodesWithCallSites,
  formatToolOutput,
} from "../shared/formatToolOutput.js";
import { loadNodeSnippets } from "../shared/loadNodeSnippets.js";
import type { QueryOptions } from "../shared/QueryTypes.js";
import { queryNodeInfos } from "../shared/queryNodeInfos.js";
import { queryNodeMetadata } from "../shared/queryNodeMetadata.js";
import { queryDependencyEdges } from "../shared/queryTraversalEdges.js";
import { resolveSymbol } from "../shared/symbolNotFound.js";

/**
 * Find all code that a symbol depends on (forward dependencies).
 *
 * "What does this symbol depend on?"
 */
export function dependenciesOf(
  db: Database.Database,
  filePath: string | undefined,
  symbol: string,
  options: QueryOptions = {},
): string {
  // Resolve symbol (handles exact match + method name auto-resolution)
  const resolution = resolveSymbol(db, filePath, symbol);
  if (!resolution.success) {
    return resolution.error;
  }

  const nodeId = resolution.nodeId;
  const resolutionMessage = resolution.message;
  const filePathWasResolved = resolution.filePathWasResolved ?? false;

  // Query edges
  let edges = queryDependencyEdges(db, nodeId);
  let currentNodeId = nodeId;
  let fallbackMessage: string | undefined;

  // If no dependencies found, attempt class method fallback
  if (edges.length === 0) {
    const fallback = attemptClassMethodFallback(db, nodeId);

    if (fallback.type === "single-method") {
      // Auto-resolve to the single method with dependencies
      // biome-ignore lint/style/noNonNullAssertion: split after includes check
      const className = symbol.includes(".") ? symbol.split(".")[0]! : symbol;
      fallbackMessage = `Resolved '${className}' to ${className}.${fallback.methodName}`;
      currentNodeId = fallback.methodId;
      edges = queryDependencyEdges(db, currentNodeId);
    } else if (fallback.type === "multiple-methods") {
      // Return disambiguation message
      // biome-ignore lint/style/noNonNullAssertion: split after includes check
      const className = symbol.includes(".") ? symbol.split(".")[0]! : symbol;
      const disambiguation = formatDisambiguationMessage(
        className,
        fallback.methods,
      );
      return resolutionMessage
        ? `${resolutionMessage}\n\n${disambiguation}`
        : disambiguation;
    }
  }

  // Combine resolution messages
  const combinedMessage = [resolutionMessage, fallbackMessage]
    .filter(Boolean)
    .join("\n\n");

  if (edges.length === 0) {
    const noResults = "No dependencies found.";
    return combinedMessage ? `${combinedMessage}\n\n${noResults}` : noResults;
  }

  // Collect all node IDs from edges
  const nodeIds = collectNodeIds(edges);

  // For mermaid format, skip node loading and return graph only
  if (options.format === "mermaid") {
    const metadataByNodeId = queryNodeMetadata(db, nodeIds);
    const output = formatMermaid(edges, {
      maxNodes: options.maxNodes,
      metadataByNodeId,
    });
    return combinedMessage ? `${combinedMessage}\n\n${output}` : output;
  }

  // Query node information
  // When file_path was auto-resolved, include input node so agent sees which file was resolved
  // Otherwise, exclude it from the query (exclusion happens here for MCP text output)
  const nodeIdsToQuery = filePathWasResolved
    ? nodeIds
    : nodeIds.filter((id) => id !== currentNodeId);
  const nodes = queryNodeInfos(db, nodeIdsToQuery);

  // Enrich with call sites BEFORE loading snippets
  // (so extractSnippet can truncate around call sites)
  const enrichedNodes = enrichNodesWithCallSites(nodes, edges);

  const nodesWithSnippets = loadNodeSnippets(enrichedNodes, nodes.length);

  // Format output (pure)
  // Exclusion already happened at query time (nodeIdsToQuery)
  const output = formatToolOutput({
    edges,
    nodes: nodesWithSnippets,
    maxNodes: options.maxNodes,
  });

  // Prepend resolution message if symbol was auto-resolved
  return combinedMessage ? `${combinedMessage}\n\n${output}` : output;
}
