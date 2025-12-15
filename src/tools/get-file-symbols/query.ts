import type Database from "better-sqlite3";
import type { Node, NodeType } from "../../db/Types.js";

interface NodeRow {
	id: string;
	type: string;
	name: string;
	module: string;
	package: string;
	file_path: string;
	start_line: number;
	end_line: number;
	exported: number;
	properties: string;
}

const rowToNode = (row: NodeRow): Node => {
	const properties = JSON.parse(row.properties) as Record<string, unknown>;
	return {
		id: row.id,
		type: row.type as NodeType,
		name: row.name,
		module: row.module,
		package: row.package,
		filePath: row.file_path,
		startLine: row.start_line,
		endLine: row.end_line,
		exported: row.exported === 1,
		...properties,
	} as Node;
};

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
