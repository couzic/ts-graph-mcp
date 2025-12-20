import type Database from "better-sqlite3";
import type { Edge, Node } from "../../db/Types.js";
import {
	type EdgeRow,
	type NodeRow,
	rowToEdge,
	rowToNode,
} from "../shared/rowConverters.js";

/**
 * Traversal direction options.
 */
export type Direction = "outgoing" | "incoming" | "both";

/**
 * Result of a neighbor query.
 */
export interface NeighborResult {
	center: Node;
	nodes: Node[];
	edges: Edge[];
}

/**
 * Query neighbors of a node within a given distance.
 *
 * Uses recursive CTEs for efficient graph traversal with direction control:
 * - outgoing: follow edges where node is source
 * - incoming: follow edges where node is target
 * - both: bidirectional traversal
 *
 * @param db - Database connection
 * @param centerId - ID of the center node
 * @param distance - Maximum distance from center (number of edges)
 * @param direction - Traversal direction (default: "both")
 * @returns Subgraph containing center, neighbors, and edges
 */
export function queryNeighbors(
	db: Database.Database,
	centerId: string,
	distance: number,
	direction: Direction = "both",
): NeighborResult {
	// Get center node first
	const centerRow = db
		.prepare<[string], NodeRow>("SELECT * FROM nodes WHERE id = ?")
		.get(centerId);

	if (!centerRow) {
		throw new Error(`Node not found: ${centerId}`);
	}

	const center = rowToNode(centerRow);

	// Build direction-specific CTE
	const neighborsCte = buildNeighborsCte(direction);

	// Get all neighbor nodes
	const nodesSql = `
		${neighborsCte}
		SELECT DISTINCT nd.*
		FROM neighbors nb
		JOIN nodes nd ON nd.id = nb.id
	`;
	const nodeRows = db
		.prepare<[string, number], NodeRow>(nodesSql)
		.all(centerId, distance);
	const nodes = nodeRows.map(rowToNode);

	// Get edges between neighbors
	const nodeIds = new Set(nodes.map((n) => n.id));
	const edges = queryEdgesBetween(db, nodeIds);

	return { center, nodes, edges };
}

/**
 * Build the recursive CTE for neighbor traversal based on direction.
 */
function buildNeighborsCte(direction: Direction): string {
	if (direction === "outgoing") {
		return `
			WITH RECURSIVE neighbors(id, depth) AS (
				SELECT ?, 0
				UNION
				SELECT e.target, n.depth + 1
				FROM edges e
				JOIN neighbors n ON e.source = n.id
				WHERE n.depth < ?
			)
		`;
	}

	if (direction === "incoming") {
		return `
			WITH RECURSIVE neighbors(id, depth) AS (
				SELECT ?, 0
				UNION
				SELECT e.source, n.depth + 1
				FROM edges e
				JOIN neighbors n ON e.target = n.id
				WHERE n.depth < ?
			)
		`;
	}

	// both directions
	return `
		WITH RECURSIVE neighbors(id, depth) AS (
			SELECT ?, 0
			UNION
			SELECT
				CASE WHEN e.source = n.id THEN e.target ELSE e.source END,
				n.depth + 1
			FROM edges e
			JOIN neighbors n ON e.source = n.id OR e.target = n.id
			WHERE n.depth < ?
		)
	`;
}

/**
 * Query all edges where both endpoints are in the given node set.
 */
function queryEdgesBetween(
	db: Database.Database,
	nodeIds: Set<string>,
): Edge[] {
	if (nodeIds.size === 0) return [];

	const placeholders = [...nodeIds].map(() => "?").join(", ");
	const sql = `
		SELECT e.*
		FROM edges e
		WHERE e.source IN (${placeholders})
		  AND e.target IN (${placeholders})
	`;

	const params = [...nodeIds, ...nodeIds];
	const rows = db.prepare(sql).all(...params) as EdgeRow[];
	return rows.map(rowToEdge);
}
