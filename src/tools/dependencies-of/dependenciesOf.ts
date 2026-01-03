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
  const edges = queryDependencyEdges(db, nodeId);

  if (edges.length === 0) {
    return "No dependencies found.";
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
