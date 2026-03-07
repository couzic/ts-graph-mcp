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
 *
 * @spec tool::query.bidirectional-implements-extends
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
      SELECT source, 1 FROM edges
      WHERE target = ? AND type IN ('IMPLEMENTS', 'EXTENDS')
      UNION
      SELECT
        CASE WHEN e.source = d.id THEN e.target ELSE e.source END,
        d.depth + 1
      FROM edges e
      JOIN deps d ON
        (e.source = d.id AND e.type IN (${edgeTypesPlaceholder}))
        OR (e.target = d.id AND e.type IN ('IMPLEMENTS', 'EXTENDS'))
      WHERE d.depth < ?
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
    sourceId,
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
 *
 * @spec tool::query.bidirectional-implements-extends
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
      SELECT target, 1 FROM edges
      WHERE source = ? AND type IN ('IMPLEMENTS', 'EXTENDS')
      UNION
      SELECT
        CASE WHEN e.target = c.id THEN e.source ELSE e.target END,
        c.depth + 1
      FROM edges e
      JOIN callers c ON
        (e.target = c.id AND e.type IN (${edgeTypesPlaceholder}))
        OR (e.source = c.id AND e.type IN ('IMPLEMENTS', 'EXTENDS'))
      WHERE c.depth < ?
    )
    SELECT DISTINCT e.source, e.target, e.type, e.call_sites
    FROM edges e
    WHERE (e.source IN (SELECT id FROM callers)
           OR (e.source = ? AND e.type IN ('IMPLEMENTS', 'EXTENDS')))
      AND (e.target = ? OR e.target IN (SELECT id FROM callers))
      AND e.type IN (${edgeTypesPlaceholder})
  `;

  const params = [
    targetId,
    ...EDGE_TYPES,
    targetId,
    ...EDGE_TYPES,
    MAX_DEPTH,
    targetId,
    targetId,
    ...EDGE_TYPES,
  ];

  const rows = db.prepare<unknown[], EdgeRowWithCallSites>(sql).all(...params);
  return parseEdgeRows(rows);
};
