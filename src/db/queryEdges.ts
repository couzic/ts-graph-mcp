import type Database from "better-sqlite3";
import type { Edge, EdgeType } from "./Types.js";

/**
 * Filters for querying edges.
 */
export interface EdgeFilters {
	/** Filter by edge type(s) */
	type?: EdgeType | EdgeType[];

	/** Glob pattern for source node ID (e.g., "*formatUserName*") */
	sourcePattern?: string;

	/** Glob pattern for target node ID (e.g., "*User") */
	targetPattern?: string;

	/** Exact match for source node ID */
	sourceId?: string;

	/** Exact match for target node ID */
	targetId?: string;

	/** Filter by context (for USES_TYPE edges) */
	context?: "parameter" | "return" | "property" | "variable";

	/** Filter by reference context (for REFERENCES edges) */
	referenceContext?:
		| "callback"
		| "property"
		| "array"
		| "return"
		| "assignment"
		| "access";
}

interface EdgeRow {
	source: string;
	target: string;
	type: string;
	call_count: number | null;
	is_type_only: number | null;
	imported_symbols: string | null;
	context: string | null;
	reference_context: string | null;
}

const rowToEdge = (row: EdgeRow): Edge => {
	const edge: Edge = {
		source: row.source,
		target: row.target,
		type: row.type as EdgeType,
	};

	if (row.call_count !== null) {
		edge.callCount = row.call_count;
	}

	if (row.is_type_only !== null) {
		edge.isTypeOnly = row.is_type_only === 1;
	}

	if (row.imported_symbols !== null) {
		edge.importedSymbols = JSON.parse(row.imported_symbols) as string[];
	}

	if (row.context !== null) {
		edge.context = row.context as Edge["context"];
	}

	if (row.reference_context !== null) {
		edge.referenceContext = row.reference_context as Edge["referenceContext"];
	}

	return edge;
};

/**
 * Query edges with optional filters.
 *
 * This function provides a database-agnostic way to query edges,
 * suitable for use in integration tests that need to verify edge extraction.
 *
 * @example
 * // Find all CALLS edges
 * const callEdges = queryEdges(db, { type: "CALLS" });
 *
 * @example
 * // Find USES_TYPE edges from formatUserName to User
 * const edges = queryEdges(db, {
 *   type: "USES_TYPE",
 *   sourcePattern: "*formatUserName*",
 *   targetPattern: "*User"
 * });
 *
 * @example
 * // Find edge with exact source and target
 * const edges = queryEdges(db, {
 *   sourceId: "src/api.ts:getUser",
 *   targetId: "src/types.ts:User",
 *   type: "USES_TYPE"
 * });
 */
export function queryEdges(
	db: Database.Database,
	filters: EdgeFilters = {},
): Edge[] {
	const conditions: string[] = [];
	const params: (string | number)[] = [];

	if (filters.type) {
		const types = Array.isArray(filters.type) ? filters.type : [filters.type];
		conditions.push(`type IN (${types.map(() => "?").join(", ")})`);
		params.push(...types);
	}

	if (filters.sourcePattern) {
		conditions.push("source GLOB ?");
		params.push(filters.sourcePattern);
	}

	if (filters.targetPattern) {
		conditions.push("target GLOB ?");
		params.push(filters.targetPattern);
	}

	if (filters.sourceId) {
		conditions.push("source = ?");
		params.push(filters.sourceId);
	}

	if (filters.targetId) {
		conditions.push("target = ?");
		params.push(filters.targetId);
	}

	if (filters.context) {
		conditions.push("context = ?");
		params.push(filters.context);
	}

	if (filters.referenceContext) {
		conditions.push("reference_context = ?");
		params.push(filters.referenceContext);
	}

	const whereClause =
		conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
	const sql = `SELECT source, target, type, call_count, is_type_only, imported_symbols, context, reference_context FROM edges ${whereClause}`;

	const stmt = db.prepare<(string | number)[], EdgeRow>(sql);
	const rows = stmt.all(...params);
	return rows.map(rowToEdge);
}
