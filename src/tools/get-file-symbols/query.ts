import type Database from "better-sqlite3";
import type { Node } from "../../db/Types.js";
import { type NodeRow, rowToNode } from "../shared/rowConverters.js";

/**
 * Query all nodes in a file.
 */
export function queryFileNodes(
	db: Database.Database,
	filePath: string,
): Node[] {
	const stmt = db.prepare<[string], NodeRow>(
		"SELECT * FROM nodes WHERE file_path = ?",
	);
	const rows = stmt.all(filePath);
	return rows.map(rowToNode);
}
