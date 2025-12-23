import type Database from "better-sqlite3";
import type { Node } from "../../db/Types.js";
import { type NodeRow, rowToNode } from "../shared/rowConverters.js";

export interface CalleeWithCallSites {
	node: Node;
	callSites: number[];
}

/**
 * Query all callees of a function/method (forward call graph traversal).
 * Uses recursive CTE to follow outgoing CALLS edges.
 *
 * @param db - Database connection
 * @param sourceId - Source node ID
 * @param maxDepth - Maximum traversal depth (default: 100)
 * @returns List of nodes that the source calls
 */
export function queryCallees(
	db: Database.Database,
	sourceId: string,
	maxDepth = 100,
): Node[] {
	const sql = `
    WITH RECURSIVE callees(id, depth) AS (
      SELECT target, 1
      FROM edges e
      WHERE e.source = ? AND e.type = 'CALLS'

      UNION

      SELECT e.target, c.depth + 1
      FROM edges e
      JOIN callees c ON e.source = c.id
      WHERE e.type = 'CALLS' AND c.depth < ?
    )
    SELECT DISTINCT n.*
    FROM callees c
    JOIN nodes n ON n.id = c.id
  `;

	const stmt = db.prepare<[string, number], NodeRow>(sql);
	const rows = stmt.all(sourceId, maxDepth);
	return rows.map(rowToNode);
}

interface CalleeRowWithCallSites extends NodeRow {
	call_sites: string | null;
}

/**
 * Query direct callees of a function/method with their call site line numbers.
 *
 * This is used when includeSnippets is true to get the exact lines where calls occur.
 * Only returns direct callees (depth=1) since call sites are only meaningful for direct calls.
 *
 * @param db - Database connection
 * @param sourceId - Node ID of the function/method making the calls
 * @returns Array of callee nodes with their call site line numbers
 */
export function queryCalleesWithCallSites(
	db: Database.Database,
	sourceId: string,
): CalleeWithCallSites[] {
	const sql = `
    SELECT n.*, e.call_sites
    FROM edges e
    JOIN nodes n ON n.id = e.target
    WHERE e.source = ? AND e.type = 'CALLS'
  `;

	const rows = db.prepare(sql).all(sourceId) as CalleeRowWithCallSites[];

	return rows.map((row) => ({
		node: rowToNode(row),
		callSites: row.call_sites ? JSON.parse(row.call_sites) : [],
	}));
}
