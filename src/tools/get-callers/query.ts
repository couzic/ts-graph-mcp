import type Database from "better-sqlite3";
import type { Node } from "../../db/Types.js";
import { type NodeRow, rowToNode } from "../shared/rowConverters.js";

interface FilterResult {
	sql: string;
	params: string[];
}

const buildModuleFilter = (moduleFilter?: string[]): FilterResult => {
	if (!moduleFilter || moduleFilter.length === 0) {
		return { sql: "", params: [] };
	}
	const placeholders = moduleFilter.map(() => "?").join(", ");
	return {
		sql: `AND n.module IN (${placeholders})`,
		params: moduleFilter,
	};
};

export interface QueryCallersOptions {
	maxDepth?: number;
	moduleFilter?: string[];
}

/**
 * Query all callers of a function/method using recursive CTE.
 *
 * @param db - Database connection
 * @param targetId - Node ID of the function/method being called
 * @param options - Query options (maxDepth, moduleFilter)
 * @returns Array of nodes that call the target
 */
export function queryCallers(
	db: Database.Database,
	targetId: string,
	options?: QueryCallersOptions,
): Node[] {
	const maxDepth = options?.maxDepth ?? 100;
	const moduleFilter = buildModuleFilter(options?.moduleFilter);

	const sql = `
        WITH RECURSIVE callers(id, depth) AS (
          SELECT source, 1
          FROM edges e
          WHERE e.target = ? AND e.type = 'CALLS'

          UNION

          SELECT e.source, c.depth + 1
          FROM edges e
          JOIN callers c ON e.target = c.id
          WHERE e.type = 'CALLS' AND c.depth < ?
        )
        SELECT DISTINCT n.*
        FROM callers c
        JOIN nodes n ON n.id = c.id
        WHERE 1=1 ${moduleFilter.sql}
      `;

	const rows = db
		.prepare(sql)
		.all(targetId, maxDepth, ...moduleFilter.params) as NodeRow[];
	return rows.map(rowToNode);
}
