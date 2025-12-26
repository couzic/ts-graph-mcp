import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { initializeSchema } from "../../db/sqlite/sqliteSchema.utils.js";
import {
	validateFileExists,
	validateSymbolExists,
} from "./validateSymbolExists.js";

describe.skip(validateSymbolExists.name, () => {
	let db: Database.Database;

	beforeEach(() => {
		db = new Database(":memory:");
		initializeSchema(db);
	});

	afterEach(() => {
		db.close();
	});

	it("returns valid:true when symbol exists", () => {
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

		const result = validateSymbolExists(db, "src/utils.ts:formatDate");

		expect(result).toEqual({ valid: true });
	});

	it("returns error with suggestion when symbol does not exist", () => {
		const result = validateSymbolExists(
			db,
			"src/nonexistent.ts:missingFunction",
		);

		expect(result.valid).toBe(false);
		if (!result.valid) {
			expect(result.error).toContain(
				"Symbol not found: src/nonexistent.ts:missingFunction",
			);
			expect(result.error).toContain("does not exist in the graph");
			expect(result.error).toContain("Use search to find valid symbols");
		}
	});

	it("uses custom paramName in error message", () => {
		const result = validateSymbolExists(db, "invalid:id", "sourceSymbol");

		expect(result.valid).toBe(false);
		if (!result.valid) {
			expect(result.error).toContain(
				'The sourceSymbol "invalid:id" does not exist',
			);
		}
	});
});

describe.skip(validateFileExists.name, () => {
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
			expect(result.error).toContain("Use search");
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
