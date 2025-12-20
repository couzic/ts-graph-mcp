import type Database from "better-sqlite3";
import type { Node } from "../../db/Types.js";
import { type NodeRow, rowToNode } from "../shared/rowConverters.js";

/**
 * Query all callees of a function/method (forward call graph traversal).
 * Uses recursive CTE to follow outgoing CALLS edges.
 *
 * @param db - Database connection
 * @param sourceId - Source node ID
 * @param maxDepth - Maximum traversal depth (default: 100)
 * @returns List of nodes that the source calls
 */
export function queryCallees(
	db: Database.Database,
	sourceId: string,
	maxDepth = 100,
): Node[] {
	const sql = `
    WITH RECURSIVE callees(id, depth) AS (
      SELECT target, 1
      FROM edges e
      WHERE e.source = ? AND e.type = 'CALLS'

      UNION

      SELECT e.target, c.depth + 1
      FROM edges e
      JOIN callees c ON e.source = c.id
      WHERE e.type = 'CALLS' AND c.depth < ?
    )
    SELECT DISTINCT n.*
    FROM callees c
    JOIN nodes n ON n.id = c.id
  `;

	const stmt = db.prepare<[string, number], NodeRow>(sql);
	const rows = stmt.all(sourceId, maxDepth);
	return rows.map(rowToNode);
}
