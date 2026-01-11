import type Database from "better-sqlite3";
import { collectNodeIds } from "../shared/collectNodeIds.js";
import { EDGE_TYPES, MAX_DEPTH } from "../shared/constants.js";
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
  const edges = queryDependentEdges(db, nodeId);

  if (edges.length === 0) {
    const noResults = "No dependents found.";
    return resolutionMessage ? `${resolutionMessage}\n\n${noResults}` : noResults;
  }

  // Query node information
  // When file_path was auto-resolved, include input node so agent sees which file was resolved
  const nodeIds = collectNodeIds(edges, nodeId);
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
  const excludeNodeIds = filePathWasResolved ? new Set<string>() : new Set([nodeId]);

  // Format output (pure)
  const output = formatToolOutput({
    edges,
    nodes: nodesWithSnippets,
    excludeNodeIds,
    maxNodes: options.maxNodes,
  });

  // Prepend resolution message if symbol was auto-resolved
  return resolutionMessage ? `${resolutionMessage}\n\n${output}` : output;
}
