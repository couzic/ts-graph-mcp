import type Database from "better-sqlite3";
import {
  attemptClassMethodFallback,
  formatDisambiguationMessage,
} from "../shared/classMethodFallback.js";
import { collectNodeIds } from "../shared/collectNodeIds.js";
import { MAX_DEPTH } from "../shared/constants.js";
import { formatMermaid } from "../shared/formatMermaid.js";
import {
  enrichNodesWithCallSites,
  formatToolOutput,
} from "../shared/formatToolOutput.js";
import { loadNodeSnippets } from "../shared/loadNodeSnippets.js";
import {
  type EdgeRowWithCallSites,
  type GraphEdgeWithCallSites,
  parseEdgeRows,
} from "../shared/parseEdgeRows.js";
import { queryNodeInfos } from "../shared/queryNodeInfos.js";
import { queryNodeMetadata } from "../shared/queryNodeMetadata.js";
import type { QueryOptions } from "../shared/QueryTypes.js";
import { resolveSymbol } from "../shared/symbolNotFound.js";
import { EDGE_TYPES } from "@ts-graph/shared";

/**
 * Query all reverse dependencies (callers/dependents) of a target node.
 * Returns all edges in the reachable subgraph with call site information.
 */
const queryDependentEdges = (
  db: Database.Database,
  targetId: string,
): GraphEdgeWithCallSites[] => {
  const edgeTypesPlaceholder = EDGE_TYPES.map(() => "?").join(", ");

  const sql = `
    WITH RECURSIVE callers(id, depth) AS (
      SELECT source, 1 FROM edges
      WHERE target = ? AND type IN (${edgeTypesPlaceholder})
      UNION
      SELECT e.source, c.depth + 1 FROM edges e
      JOIN callers c ON e.target = c.id
      WHERE e.type IN (${edgeTypesPlaceholder}) AND c.depth < ?
    )
    SELECT DISTINCT e.source, e.target, e.type, e.call_sites
    FROM edges e
    WHERE e.source IN (SELECT id FROM callers)
      AND (e.target = ? OR e.target IN (SELECT id FROM callers))
      AND e.type IN (${edgeTypesPlaceholder})
  `;

  const params = [
    targetId,
    ...EDGE_TYPES,
    ...EDGE_TYPES,
    MAX_DEPTH,
    targetId,
    ...EDGE_TYPES,
  ];

  const rows = db.prepare<unknown[], EdgeRowWithCallSites>(sql).all(...params);
  return parseEdgeRows(rows);
};

/**
 * Find all code that depends on a symbol (reverse dependencies).
 *
 * "Who depends on this symbol?"
 */
export function dependentsOf(
  db: Database.Database,
  projectRoot: string,
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
  let edges = queryDependentEdges(db, nodeId);
  let currentNodeId = nodeId;
  let fallbackMessage: string | undefined;

  // If no dependents found, attempt class method fallback
  if (edges.length === 0) {
    const fallback = attemptClassMethodFallback(db, nodeId);

    if (fallback.type === "single-method") {
      // Auto-resolve to the single method with dependents
      const className = symbol.includes(".") ? symbol.split(".")[0]! : symbol;
      fallbackMessage = `Resolved '${className}' to ${className}.${fallback.methodName}`;
      currentNodeId = fallback.methodId;
      edges = queryDependentEdges(db, currentNodeId);
    } else if (fallback.type === "multiple-methods") {
      // Return disambiguation message
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
    const noResults = "No dependents found.";
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

  // Load snippets (I/O boundary)
  const nodesWithSnippets = loadNodeSnippets(
    enrichedNodes,
    projectRoot,
    nodes.length,
  );

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
