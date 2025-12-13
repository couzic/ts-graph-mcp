import type Database from "better-sqlite3";
import type { Edge, EdgeType } from "../../../db/Types.js";

/**
 * Edge data returned from database row.
 */
interface EdgeRow {
	source: string;
	target: string;
	type: string;
	call_count: number | null;
	is_type_only: number | null;
	imported_symbols: string | null;
	context: string | null;
}

const rowToEdge = (row: EdgeRow): Edge => {
	const edge: Edge = {
		source: row.source,
		target: row.target,
		type: row.type as EdgeType,
	};
	if (row.call_count != null) edge.callCount = row.call_count;
	if (row.is_type_only != null) edge.isTypeOnly = row.is_type_only === 1;
	if (row.imported_symbols != null)
		edge.importedSymbols = JSON.parse(row.imported_symbols) as string[];
	if (row.context != null) edge.context = row.context as Edge["context"];
	return edge;
};

/**
 * Path result from the query.
 */
export interface PathResult {
	/** Node IDs in order from source to target */
	nodes: string[];
	/** Edges connecting consecutive nodes */
	edges: Edge[];
}

/**
 * Query the shortest path between two nodes using BFS.
 *
 * Uses recursive CTE with JSON array for path tracking and cycle detection.
 *
 * @param db - Database connection
 * @param sourceId - Starting node ID
 * @param targetId - Target node ID
 * @returns Path result or null if no path exists
 */
export function queryPath(
	db: Database.Database,
	sourceId: string,
	targetId: string,
): PathResult | null {
	// BFS to find shortest path using recursive CTE with path tracking
	const sql = `
		WITH RECURSIVE path_search(node_id, path_nodes, path_length) AS (
			SELECT ?, json_array(?), 0

			UNION ALL

			SELECT
				e.target,
				json_insert(p.path_nodes, '$[#]', e.target),
				p.path_length + 1
			FROM edges e
			JOIN path_search p ON e.source = p.node_id
			WHERE p.path_length < 20
				AND json_array_length(p.path_nodes) <= 20
				AND NOT EXISTS (
					SELECT 1 FROM json_each(p.path_nodes)
					WHERE json_each.value = e.target
				)
		)
		SELECT path_nodes, path_length
		FROM path_search
		WHERE node_id = ?
		ORDER BY path_length
		LIMIT 1
	`;

	const row = db.prepare(sql).get(sourceId, sourceId, targetId) as
		| { path_nodes: string; path_length: number }
		| undefined;

	if (!row) return null;

	const nodes = JSON.parse(row.path_nodes) as string[];

	// Fetch edges along the path
	const edges: Edge[] = [];
	for (let i = 0; i < nodes.length - 1; i++) {
		const from = nodes[i];
		const to = nodes[i + 1];
		if (from === undefined || to === undefined) continue;
		const edgeRow = db
			.prepare<[string, string], EdgeRow>(
				"SELECT * FROM edges WHERE source = ? AND target = ? LIMIT 1",
			)
			.get(from, to);
		if (edgeRow) {
			edges.push(rowToEdge(edgeRow));
		}
	}

	return { nodes, edges };
}
