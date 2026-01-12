import type Database from "better-sqlite3";
import {
  attemptClassMethodFallback,
  formatDisambiguationMessage,
} from "../shared/classMethodFallback.js";
import { collectNodeIds } from "../shared/collectNodeIds.js";
import { EDGE_TYPES, MAX_DEPTH } from "../shared/constants.js";
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
import type { QueryOptions } from "../shared/QueryTypes.js";
import { resolveSymbol } from "../shared/symbolNotFound.js";

/**
 * Query all forward dependencies from a source node.
 * Returns all edges in the reachable subgraph with call site information.
 */
const queryDependencyEdges = (
  db: Database.Database,
  sourceId: string,
): GraphEdgeWithCallSites[] => {
  const edgeTypesPlaceholder = EDGE_TYPES.map(() => "?").join(", ");

  const sql = `
    WITH RECURSIVE deps(id, depth) AS (
      SELECT target, 1 FROM edges
      WHERE source = ? AND type IN (${edgeTypesPlaceholder})
      UNION
      SELECT e.target, d.depth + 1 FROM edges e
      JOIN deps d ON e.source = d.id
      WHERE e.type IN (${edgeTypesPlaceholder}) AND d.depth < ?
    )
    SELECT DISTINCT e.source, e.target, e.type, e.call_sites
    FROM edges e
    WHERE (e.source = ? OR e.source IN (SELECT id FROM deps))
      AND e.target IN (SELECT id FROM deps)
      AND e.type IN (${edgeTypesPlaceholder})
  `;

  const params = [
    sourceId,
    ...EDGE_TYPES,
    ...EDGE_TYPES,
    MAX_DEPTH,
    sourceId,
    ...EDGE_TYPES,
  ];

  const rows = db.prepare<unknown[], EdgeRowWithCallSites>(sql).all(...params);
  return parseEdgeRows(rows);
};

/**
 * Find all code that a symbol depends on (forward dependencies).
 *
 * "What does this symbol depend on?"
 */
export function dependenciesOf(
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
  let edges = queryDependencyEdges(db, nodeId);
  let currentNodeId = nodeId;
  let fallbackMessage: string | undefined;

  // If no dependencies found, attempt class method fallback
  if (edges.length === 0) {
    const fallback = attemptClassMethodFallback(db, nodeId);

    if (fallback.type === "single-method") {
      // Auto-resolve to the single method with dependencies
      const className = symbol.includes(".") ? symbol.split(".")[0]! : symbol;
      fallbackMessage = `Resolved '${className}' to ${className}.${fallback.methodName}`;
      currentNodeId = fallback.methodId;
      edges = queryDependencyEdges(db, currentNodeId);
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
    const noResults = "No dependencies found.";
    return combinedMessage ? `${combinedMessage}\n\n${noResults}` : noResults;
  }

  // For mermaid format, skip node loading and return graph only
  if (options.format === "mermaid") {
    const output = formatMermaid(edges);
    return combinedMessage ? `${combinedMessage}\n\n${output}` : output;
  }

  // Query node information
  // When file_path was auto-resolved, include input node so agent sees which file was resolved
  const nodeIds = collectNodeIds(edges, currentNodeId);
  if (filePathWasResolved) {
    nodeIds.push(nodeId);
  }
  const nodes = queryNodeInfos(db, nodeIds);

  // Enrich with call sites BEFORE loading snippets
  // (so extractSnippet can truncate around call sites)
  const enrichedNodes = enrichNodesWithCallSites(nodes, edges);

  // Load snippets (I/O boundary)
  const nodesWithSnippets = loadNodeSnippets(
    enrichedNodes,
    projectRoot,
    nodes.length,
  );

  // Exclude input node from output unless file_path was auto-resolved
  const excludeNodeIds = filePathWasResolved
    ? new Set<string>()
    : new Set([currentNodeId]);

  // Format output (pure)
  const output = formatToolOutput({
    edges,
    nodes: nodesWithSnippets,
    excludeNodeIds,
    maxNodes: options.maxNodes,
  });

  // Prepend resolution message if symbol was auto-resolved
  return combinedMessage ? `${combinedMessage}\n\n${output}` : output;
}
