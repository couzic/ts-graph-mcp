import type Database from "better-sqlite3";
import type { Node } from "../../db/Types.js";
import { type NodeRow, rowToNode } from "../shared/rowConverters.js";

/**
 * Query all classes that implement the target interface.
 *
 * @param db - Database connection
 * @param targetId - Node ID of the interface being implemented
 * @returns Array of implementing class nodes
 */
export function queryImplementers(
	db: Database.Database,
	targetId: string,
): Node[] {
	const sql = `
        SELECT n.*
        FROM edges e
        JOIN nodes n ON e.source = n.id
        WHERE e.target = ? AND e.type = 'IMPLEMENTS'
        ORDER BY n.package, n.module, n.name
      `;

	const rows = db.prepare(sql).all(targetId) as NodeRow[];
	return rows.map(rowToNode);
}
