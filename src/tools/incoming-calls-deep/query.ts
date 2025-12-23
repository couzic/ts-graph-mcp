import type Database from "better-sqlite3";
import type { Node } from "../../db/Types.js";
import { type NodeRow, rowToNode } from "../shared/rowConverters.js";

export interface QueryCallersOptions {
	maxDepth?: number;
}

export interface CallerWithCallSites {
	node: Node;
	callSites: number[];
}

/**
 * Query all callers of a function/method using recursive CTE.
 *
 * @param db - Database connection
 * @param targetId - Node ID of the function/method being called
 * @param options - Query options (maxDepth)
 * @returns Array of nodes that call the target
 */
export function queryCallers(
	db: Database.Database,
	targetId: string,
	options?: QueryCallersOptions,
): Node[] {
	const maxDepth = options?.maxDepth ?? 100;

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
  `;

	const rows = db.prepare(sql).all(targetId, maxDepth) as NodeRow[];
	return rows.map(rowToNode);
}

interface CallerRowWithCallSites extends NodeRow {
	call_sites: string | null;
}

/**
 * Query direct callers of a function/method with their call site line numbers.
 *
 * This is used when includeSnippets is true to get the exact lines where calls occur.
 * Only returns direct callers (depth=1) since call sites are only meaningful for direct calls.
 *
 * @param db - Database connection
 * @param targetId - Node ID of the function/method being called
 * @returns Array of caller nodes with their call site line numbers
 */
export function queryCallersWithCallSites(
	db: Database.Database,
	targetId: string,
): CallerWithCallSites[] {
	const sql = `
    SELECT n.*, e.call_sites
    FROM edges e
    JOIN nodes n ON n.id = e.source
    WHERE e.target = ? AND e.type = 'CALLS'
  `;

	const rows = db.prepare(sql).all(targetId) as CallerRowWithCallSites[];

	return rows.map((row) => ({
		node: rowToNode(row),
		callSites: row.call_sites ? JSON.parse(row.call_sites) : [],
	}));
}
