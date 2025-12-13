import type Database from "better-sqlite3";
import type { Node, NodeType, SearchFilters } from "../../../db/Types.js";

interface NodeRow {
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

const rowToNode = (row: NodeRow): Node => {
	const properties = JSON.parse(row.properties) as Record<string, unknown>;
	return {
		id: row.id,
		type: row.type as NodeType,
		name: row.name,
		module: row.module,
		package: row.package,
		filePath: row.file_path,
		startLine: row.start_line,
		endLine: row.end_line,
		exported: row.exported === 1,
		...properties,
	} as Node;
};

/**
 * Convert glob pattern to SQLite GLOB pattern.
 * SQLite GLOB uses * and ?, same as our pattern spec.
 */
const globToSqlite = (pattern: string): string => {
	return pattern;
};

/**
 * Query nodes by name pattern with optional filters.
 */
export function querySearchNodes(
	db: Database.Database,
	pattern: string,
	filters?: SearchFilters,
): Node[] {
	const conditions: string[] = ["name GLOB ?"];
	const params: (string | number)[] = [globToSqlite(pattern)];

	if (filters?.nodeType) {
		const types = Array.isArray(filters.nodeType)
			? filters.nodeType
			: [filters.nodeType];
		conditions.push(`type IN (${types.map(() => "?").join(", ")})`);
		params.push(...types);
	}

	if (filters?.module) {
		const modules = Array.isArray(filters.module)
			? filters.module
			: [filters.module];
		conditions.push(`module IN (${modules.map(() => "?").join(", ")})`);
		params.push(...modules);
	}

	if (filters?.package) {
		const packages = Array.isArray(filters.package)
			? filters.package
			: [filters.package];
		conditions.push(`package IN (${packages.map(() => "?").join(", ")})`);
		params.push(...packages);
	}

	if (filters?.exported !== undefined) {
		conditions.push("exported = ?");
		params.push(filters.exported ? 1 : 0);
	}

	const sql = `SELECT * FROM nodes WHERE ${conditions.join(" AND ")}`;
	const stmt = db.prepare<(string | number)[], NodeRow>(sql);
	const rows = stmt.all(...params);
	return rows.map(rowToNode);
}
