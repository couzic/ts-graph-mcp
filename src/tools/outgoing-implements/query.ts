import type Database from "better-sqlite3";
import type { Node } from "../../db/Types.js";
import { type NodeRow, rowToNode } from "../shared/rowConverters.js";

/**
 * Query all interfaces that the target class implements.
 *
 * @param db - Database connection
 * @param sourceId - Node ID of the class implementing interfaces
 * @returns Array of interface nodes
 */
export function queryInterfaces(
	db: Database.Database,
	sourceId: string,
): Node[] {
	const sql = `
        SELECT n.*
        FROM edges e
        JOIN nodes n ON e.target = n.id
        WHERE e.source = ? AND e.type = 'IMPLEMENTS'
        ORDER BY n.package, n.module, n.name
      `;

	const rows = db.prepare(sql).all(sourceId) as NodeRow[];
	return rows.map(rowToNode);
}
