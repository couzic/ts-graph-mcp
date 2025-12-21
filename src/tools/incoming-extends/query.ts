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

export interface QueryDescendantsOptions {
	maxDepth?: number;
	moduleFilter?: string[];
}

/**
 * Query all descendants (subclasses/subinterfaces) using recursive CTE.
 *
 * @param db - Database connection
 * @param targetId - Node ID of the base class/interface
 * @param options - Query options (maxDepth, moduleFilter)
 * @returns Array of nodes that extend the target
 */
export function queryDescendants(
	db: Database.Database,
	targetId: string,
	options?: QueryDescendantsOptions,
): Node[] {
	const maxDepth = options?.maxDepth ?? 10;
	const moduleFilter = buildModuleFilter(options?.moduleFilter);

	const sql = `
        WITH RECURSIVE descendants(id, depth) AS (
          SELECT source, 1
          FROM edges e
          WHERE e.target = ? AND e.type = 'EXTENDS'

          UNION

          SELECT e.source, d.depth + 1
          FROM edges e
          JOIN descendants d ON e.target = d.id
          WHERE e.type = 'EXTENDS' AND d.depth < ?
        )
        SELECT DISTINCT n.*
        FROM descendants d
        JOIN nodes n ON n.id = d.id
        WHERE 1=1 ${moduleFilter.sql}
        ORDER BY n.name
      `;

	const rows = db
		.prepare(sql)
		.all(targetId, maxDepth, ...moduleFilter.params) as NodeRow[];
	return rows.map(rowToNode);
}
