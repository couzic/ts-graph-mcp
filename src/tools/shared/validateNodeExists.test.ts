import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { initializeSchema } from "../../db/sqlite/SqliteSchema.js";
import {
	validateFileExists,
	validateNodeExists,
} from "./validateNodeExists.js";

describe(validateNodeExists.name, () => {
	let db: Database.Database;

	beforeEach(() => {
		db = new Database(":memory:");
		initializeSchema(db);
	});

	afterEach(() => {
		db.close();
	});

	it("returns valid:true when node exists", () => {
		db.prepare(
			"INSERT INTO nodes (id, type, name, module, package, file_path, start_line, end_line, exported) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
		).run(
			"src/utils.ts:formatDate",
			"Function",
			"formatDate",
			"main",
			"core",
			"src/utils.ts",
			1,
			10,
			1,
		);

		const result = validateNodeExists(db, "src/utils.ts:formatDate");

		expect(result).toEqual({ valid: true });
	});

	it("returns error with suggestion when node does not exist", () => {
		const result = validateNodeExists(db, "src/nonexistent.ts:missingFunction");

		expect(result.valid).toBe(false);
		if (!result.valid) {
			expect(result.error).toContain(
				"Node not found: src/nonexistent.ts:missingFunction",
			);
			expect(result.error).toContain("does not exist in the graph");
			expect(result.error).toContain("Use search_nodes to find valid node IDs");
		}
	});

	it("uses custom paramName in error message", () => {
		const result = validateNodeExists(db, "invalid:id", "sourceId");

		expect(result.valid).toBe(false);
		if (!result.valid) {
			expect(result.error).toContain(
				'The sourceId "invalid:id" does not exist',
			);
		}
	});
});

describe(validateFileExists.name, () => {
	let db: Database.Database;

	beforeEach(() => {
		db = new Database(":memory:");
		initializeSchema(db);
	});

	afterEach(() => {
		db.close();
	});

	it("returns valid:true when file has nodes", () => {
		db.prepare(
			"INSERT INTO nodes (id, type, name, module, package, file_path, start_line, end_line, exported) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
		).run(
			"src/utils.ts:formatDate",
			"Function",
			"formatDate",
			"main",
			"core",
			"src/utils.ts",
			1,
			10,
			1,
		);

		const result = validateFileExists(db, "src/utils.ts");

		expect(result).toEqual({ valid: true });
	});

	it("returns error with suggestions when file does not exist", () => {
		const result = validateFileExists(db, "src/nonexistent.ts");

		expect(result.valid).toBe(false);
		if (!result.valid) {
			expect(result.error).toContain("File not found: src/nonexistent.ts");
			expect(result.error).toContain("No symbols found for file");
			expect(result.error).toContain("Check the path is relative");
			expect(result.error).toContain("Use search_nodes");
		}
	});

	it("returns error for path with leading ./", () => {
		db.prepare(
			"INSERT INTO nodes (id, type, name, module, package, file_path, start_line, end_line, exported) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
		).run(
			"src/utils.ts:formatDate",
			"Function",
			"formatDate",
			"main",
			"core",
			"src/utils.ts",
			1,
			10,
			1,
		);

		// File exists as "src/utils.ts" but user queries with "./src/utils.ts"
		const result = validateFileExists(db, "./src/utils.ts");

		expect(result.valid).toBe(false);
		if (!result.valid) {
			expect(result.error).toContain(
				'Check the path is relative (e.g., "src/utils.ts" not "./src/utils.ts")',
			);
		}
	});
});
