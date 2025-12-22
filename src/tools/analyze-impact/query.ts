import type Database from "better-sqlite3";
import type { Node } from "../../db/Types.js";
import { type NodeRow, rowToNode } from "../shared/rowConverters.js";

export interface ImpactQueryOptions {
	maxDepth?: number;
}

/**
 * Query all nodes impacted by changes to the target node.
 * Uses recursive CTE to traverse incoming edges (what depends on this node?).
 *
 * @param db - Database connection
 * @param nodeId - Target node ID
 * @param options - Query options (maxDepth)
 * @returns Array of impacted nodes
 */
export function queryImpactedNodes(
	db: Database.Database,
	nodeId: string,
	options?: ImpactQueryOptions,
): Node[] {
	const maxDepth = options?.maxDepth ?? 100;

	// Impact analysis: traverse incoming edges (what depends on this node?)
	const sql = `
    WITH RECURSIVE impacted(id, depth) AS (
      SELECT source, 1
      FROM edges e
      WHERE e.target = ?

      UNION

      SELECT e.source, i.depth + 1
      FROM edges e
      JOIN impacted i ON e.target = i.id
      WHERE i.depth < ?
    )
    SELECT DISTINCT n.*
    FROM impacted i
    JOIN nodes n ON n.id = i.id
  `;

	const rows = db.prepare(sql).all(nodeId, maxDepth) as NodeRow[];

	return rows.map(rowToNode);
}
