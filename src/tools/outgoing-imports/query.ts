import type Database from "better-sqlite3";
import type { Node } from "../../db/Types.js";
import { type NodeRow, rowToNode } from "../shared/rowConverters.js";

/**
 * Result combining imported node with edge metadata.
 */
export interface ImportResult {
	node: Node;
	isTypeOnly: boolean;
	importedSymbols: string[];
}

/**
 * Query all imports of a file (outgoing IMPORTS edges).
 * Returns target nodes (what this file imports) with edge metadata.
 *
 * @param db - Database connection
 * @param sourceId - Source node ID (typically a File node)
 * @returns List of imported nodes with metadata
 */
export function queryImports(
	db: Database.Database,
	sourceId: string,
): ImportResult[] {
	const sql = `
    SELECT
      n.*,
      e.is_type_only,
      e.imported_symbols
    FROM edges e
    JOIN nodes n ON e.target = n.id
    WHERE e.source = ? AND e.type = 'IMPORTS'
  `;

	interface CombinedRow extends NodeRow {
		is_type_only: number | null;
		imported_symbols: string | null;
	}

	const stmt = db.prepare<[string], CombinedRow>(sql);
	const rows = stmt.all(sourceId);

	return rows.map((row) => ({
		node: rowToNode(row),
		isTypeOnly: row.is_type_only === 1,
		importedSymbols: row.imported_symbols
			? (JSON.parse(row.imported_symbols) as string[])
			: [],
	}));
}
