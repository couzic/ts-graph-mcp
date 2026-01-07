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
import { symbolNotFound } from "../shared/symbolNotFound.js";

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
  filePath: string,
  symbol: string,
): string {
  const nodeId = `${filePath}:${symbol}`;

  // Validate symbol exists
  const exists = db
    .prepare<[string], { found: 1 }>(
      "SELECT 1 as found FROM nodes WHERE id = ?",
    )
    .get(nodeId);

  if (!exists) {
    return symbolNotFound(db, filePath, symbol);
  }

  // Query edges
  const edges = queryDependentEdges(db, nodeId);

  if (edges.length === 0) {
    return "No dependents found.";
  }

  // Query node information
  const nodeIds = collectNodeIds(edges, nodeId);
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

  // Format output (pure)
  return formatToolOutput({
    edges,
    nodes: nodesWithSnippets,
    excludeNodeIds: new Set([nodeId]),
  });
}
