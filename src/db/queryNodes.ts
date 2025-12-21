import type Database from "better-sqlite3";
import { type NodeRow, rowToNode } from "../tools/shared/rowConverters.js";
import type { Node, SearchFilters } from "./Types.js";

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
export function queryNodes(
	db: Database.Database,
	pattern: string,
	filters?: SearchFilters,
): Node[] {
	const conditions: string[] = ["name GLOB ?"];
	const params: (string | number)[] = [globToSqlite(pattern)];

	if (filters?.type) {
		const types = Array.isArray(filters.type) ? filters.type : [filters.type];
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

	let sql = `SELECT * FROM nodes WHERE ${conditions.join(" AND ")}`;

	// Add pagination (LIMIT must come before OFFSET in SQLite)
	if (filters?.limit !== undefined) {
		sql += ` LIMIT ${filters.limit}`;
	} else {
		sql += " LIMIT 100"; // default limit
	}
	if (filters?.offset !== undefined) {
		sql += ` OFFSET ${filters.offset}`;
	}

	const stmt = db.prepare<(string | number)[], NodeRow>(sql);
	const rows = stmt.all(...params);
	return rows.map(rowToNode);
}
