import type Database from "better-sqlite3";
import type { Edge, Node } from "../../db/Types.js";
import { type NodeRow, rowToEdge, rowToNode } from "../shared/rowConverters.js";

export interface UsageWithEdge {
	node: Node;
	edge: Edge;
}

/**
 * Query all code that uses a type in signatures or declarations.
 *
 * @param db - Database connection
 * @param targetId - Node ID of the type being used
 * @param context - Optional filter for usage context (parameter, return, property, variable)
 * @returns Array of nodes with their USES_TYPE edges
 */
export function queryTypeUsages(
	db: Database.Database,
	targetId: string,
	context?: "parameter" | "return" | "property" | "variable",
): UsageWithEdge[] {
	const sql = `
        SELECT
          n.*,
          e.source as edge_source,
          e.target as edge_target,
          e.type as edge_type,
          e.call_count as edge_call_count,
          e.is_type_only as edge_is_type_only,
          e.imported_symbols as edge_imported_symbols,
          e.context as edge_context
        FROM edges e
        JOIN nodes n ON e.source = n.id
        WHERE e.target = ? AND e.type = 'USES_TYPE'
        ${context ? "AND e.context = ?" : ""}
        ORDER BY n.package, n.module, n.file_path, n.start_line
      `;

	const rows = db
		.prepare(sql)
		.all(context ? [targetId, context] : [targetId]) as Array<
		NodeRow & {
			edge_source: string;
			edge_target: string;
			edge_type: string;
			edge_call_count: number | null;
			edge_is_type_only: number | null;
			edge_imported_symbols: string | null;
			edge_context: string | null;
		}
	>;

	return rows.map((row) => {
		const node = rowToNode(row);
		const edge = rowToEdge({
			source: row.edge_source,
			target: row.edge_target,
			type: row.edge_type,
			call_count: row.edge_call_count,
			is_type_only: row.edge_is_type_only,
			imported_symbols: row.edge_imported_symbols,
			context: row.edge_context,
		});
		return { node, edge };
	});
}
