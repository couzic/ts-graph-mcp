import type Database from "better-sqlite3";
import type { Node } from "../../db/Types.js";

/**
 * Node with depth metadata for inheritance chain traversal.
 */
export type NodeWithDepth = Node & {
	depth: number;
};

/**
 * Database row with depth field.
 */
interface NodeWithDepthRow {
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
	depth: number;
}

/**
 * Query what a class or interface extends (forward inheritance traversal).
 * Uses recursive CTE to follow outgoing EXTENDS edges.
 *
 * @param db - Database connection
 * @param sourceId - Source node ID
 * @param maxDepth - Maximum traversal depth (default: 10)
 * @returns List of nodes that the source extends, with depth
 */
export function queryExtends(
	db: Database.Database,
	sourceId: string,
	maxDepth = 10,
): NodeWithDepth[] {
	const sql = `
    WITH RECURSIVE chain(id, depth) AS (
      SELECT target, 1
      FROM edges e
      WHERE e.source = ? AND e.type = 'EXTENDS'

      UNION

      SELECT e.target, c.depth + 1
      FROM edges e
      JOIN chain c ON e.source = c.id
      WHERE e.type = 'EXTENDS' AND c.depth < ?
    )
    SELECT n.*, c.depth
    FROM chain c
    JOIN nodes n ON n.id = c.id
    ORDER BY c.depth
  `;

	const stmt = db.prepare<[string, number], NodeWithDepthRow>(sql);
	const rows = stmt.all(sourceId, maxDepth);
	return rows.map((row) => {
		const properties = JSON.parse(row.properties || "{}");
		const baseNode = {
			id: row.id,
			type: row.type as Node["type"],
			name: row.name,
			module: row.module,
			package: row.package,
			filePath: row.file_path,
			startLine: row.start_line,
			endLine: row.end_line,
			exported: Boolean(row.exported),
			...properties,
		} as Node;

		return {
			...baseNode,
			depth: row.depth,
		} as NodeWithDepth;
	});
}
