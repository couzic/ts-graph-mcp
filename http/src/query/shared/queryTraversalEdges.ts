import { EDGE_TYPES } from "@ts-graph/shared";
import type Database from "better-sqlite3";
import { MAX_DEPTH } from "./constants.js";
import {
  type EdgeRowWithCallSites,
  type GraphEdgeWithCallSites,
  parseEdgeRows,
} from "./parseEdgeRows.js";

/**
 * Query all forward dependencies from a source node.
 * Returns all edges in the reachable subgraph with call site information.
 */
export const queryDependencyEdges = (
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
 * Query all reverse dependencies (callers/dependents) of a target node.
 * Returns all edges in the reachable subgraph with call site information.
 */
export const queryDependentEdges = (
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
