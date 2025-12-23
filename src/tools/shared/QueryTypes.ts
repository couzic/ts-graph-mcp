/**
 * Database row types for SQLite query results.
 *
 * These interfaces match the column names returned by SQLite queries
 * (snake_case) before conversion to domain types (camelCase).
 */

/**
 * Raw node row from SQLite nodes table.
 */
export interface NodeRow {
	id: string;
	type: string;
	name: string;
	module: string;
	package: string;
	file_path: string;
	start_line: number;
	end_line: number;
	exported: number;
	properties: string;
}

/**
 * Raw edge row from SQLite edges table.
 */
export interface EdgeRow {
	source: string;
	target: string;
	type: string;
	call_count: number | null;
	call_sites: string | null;
	is_type_only: number | null;
	imported_symbols: string | null;
	context: string | null;
}
