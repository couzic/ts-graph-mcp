import type Database from "better-sqlite3";
import type { EdgeType, Node } from "../../db/Types.js";
import { type NodeRow, rowToNode } from "../shared/rowConverters.js";

interface FilterResult {
	sql: string;
	params: string[];
}

const buildEdgeTypeFilter = (edgeTypes?: EdgeType[]): FilterResult => {
	if (!edgeTypes || edgeTypes.length === 0) {
		return { sql: "", params: [] };
	}
	const placeholders = edgeTypes.map(() => "?").join(", ");
	return {
		sql: `AND e.type IN (${placeholders})`,
		params: edgeTypes,
	};
};

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

export interface ImpactQueryOptions {
	maxDepth?: number;
	edgeTypes?: EdgeType[];
	moduleFilter?: string[];
}

/**
 * Query all nodes impacted by changes to the target node.
 * Uses recursive CTE to traverse incoming edges (what depends on this node?).
 *
 * @param db - Database connection
 * @param nodeId - Target node ID
 * @param options - Query options (maxDepth, edgeTypes, moduleFilter)
 * @returns Array of impacted nodes
 */
export function queryImpactedNodes(
	db: Database.Database,
	nodeId: string,
	options?: ImpactQueryOptions,
): Node[] {
	const maxDepth = options?.maxDepth ?? 100;
	const edgeFilter = buildEdgeTypeFilter(options?.edgeTypes);
	const moduleFilter = buildModuleFilter(options?.moduleFilter);

	// Impact analysis: traverse incoming edges (what depends on this node?)
	const sql = `
    WITH RECURSIVE impacted(id, depth) AS (
      SELECT source, 1
      FROM edges e
      WHERE e.target = ? ${edgeFilter.sql}

      UNION

      SELECT e.source, i.depth + 1
      FROM edges e
      JOIN impacted i ON e.target = i.id
      WHERE i.depth < ? ${edgeFilter.sql}
    )
    SELECT DISTINCT n.*
    FROM impacted i
    JOIN nodes n ON n.id = i.id
    WHERE 1=1 ${moduleFilter.sql}
  `;

	// Note: edgeFilter params appear twice (once in base case, once in recursive case)
	const rows = db
		.prepare(sql)
		.all(
			nodeId,
			...edgeFilter.params,
			maxDepth,
			...edgeFilter.params,
			...moduleFilter.params,
		) as NodeRow[];

	return rows.map(rowToNode);
}
