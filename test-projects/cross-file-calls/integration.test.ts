import { join } from "node:path";
import type Database from "better-sqlite3";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { ProjectConfig } from "../../src/config/ConfigSchema.js";
import {
	closeDatabase,
	openDatabase,
} from "../../src/db/sqlite/SqliteConnection.js";
import { initializeSchema } from "../../src/db/sqlite/SqliteSchema.js";
import { createSqliteWriter } from "../../src/db/sqlite/SqliteWriter.js";
import { indexProject } from "../../src/ingestion/Ingestion.js";
import { queryCallees } from "../../src/tools/get-callees/query.js";
import { queryCallers } from "../../src/tools/get-callers/query.js";
import { queryPath } from "../../src/tools/find-path/query.js";

/**
 * Integration tests for cross-file-calls test project.
 * Tests: main.ts:caller → helper.ts:helper (cross-file CALLS edge)
 *
 * Regression test for Issue #9 (cross-file CALLS edges not extracted).
 */
describe("cross-file-calls integration", () => {
	let db: Database.Database;

	beforeAll(async () => {
		db = openDatabase({ path: ":memory:" });
		initializeSchema(db);

		const projectRoot = join(import.meta.dirname);
		const config: ProjectConfig = {
			modules: [
				{
					name: "test",
					packages: [{ name: "main", tsconfig: "tsconfig.json" }],
				},
			],
		};
		const writer = createSqliteWriter(db);
		await indexProject(config, writer, { projectRoot });
	});

	afterAll(() => {
		closeDatabase(db);
	});

	describe(queryCallers.name, () => {
		it("finds all callers from main.ts when querying callers of helper", () => {
			const result = queryCallers(db, "src/helper.ts:helper");

			expect(result.length).toBeGreaterThanOrEqual(3);
			const callerIds = result.map((n) => n.id);
			expect(callerIds).toContain("src/main.ts:caller");
			expect(callerIds).toContain("src/main.ts:multiCaller");
			expect(callerIds).toContain("src/main.ts:anotherCaller");
		});

		it("respects maxDepth parameter for direct callers only", () => {
			const result = queryCallers(db, "src/helper.ts:helper", {
				maxDepth: 1,
			});

			expect(result.length).toBeGreaterThanOrEqual(3);
			const callerIds = result.map((n) => n.id);
			expect(callerIds).toContain("src/main.ts:caller");
		});
	});

	describe(queryCallees.name, () => {
		it("finds helper from helper.ts when querying callees of caller", () => {
			const result = queryCallees(db, "src/main.ts:caller");

			expect(result).toHaveLength(1);
			expect(result[0]?.id).toBe("src/helper.ts:helper");
			expect(result[0]?.name).toBe("helper");
			expect(result[0]?.filePath).toBe("src/helper.ts");
		});

		it("respects maxDepth parameter for direct callees only", () => {
			const result = queryCallees(db, "src/main.ts:caller", 1);

			expect(result).toHaveLength(1);
			expect(result[0]?.id).toBe("src/helper.ts:helper");
		});
	});

	describe(queryPath.name, () => {
		it("finds path from caller to helper across files", () => {
			const result = queryPath(
				db,
				"src/main.ts:caller",
				"src/helper.ts:helper",
			);

			expect(result).not.toBeNull();
			expect(result?.nodes).toEqual([
				"src/main.ts:caller",
				"src/helper.ts:helper",
			]);
			expect(result?.edges).toHaveLength(1);
			expect(result?.edges[0]?.type).toBe("CALLS");
		});

		it("returns null for path in wrong direction", () => {
			const result = queryPath(
				db,
				"src/helper.ts:helper",
				"src/main.ts:caller",
			);

			expect(result).toBeNull();
		});
	});

	describe("direct edge verification", () => {
		it("creates CALLS edge in database with correct properties", () => {
			const edge = db
				.prepare(
					`
				SELECT source, target, type, call_count
				FROM edges
				WHERE source = ? AND target = ? AND type = ?
			`,
				)
				.get("src/main.ts:caller", "src/helper.ts:helper", "CALLS");

			expect(edge).toBeDefined();
			expect(edge).toMatchObject({
				source: "src/main.ts:caller",
				target: "src/helper.ts:helper",
				type: "CALLS",
				call_count: 1,
			});
		});

		it("tracks call count when function is called multiple times", () => {
			const edge = db
				.prepare(
					`
				SELECT source, target, type, call_count
				FROM edges
				WHERE source = ? AND target = ? AND type = ?
			`,
				)
				.get("src/main.ts:multiCaller", "src/helper.ts:helper", "CALLS");

			expect(edge).toBeDefined();
			expect(edge).toMatchObject({
				source: "src/main.ts:multiCaller",
				target: "src/helper.ts:helper",
				type: "CALLS",
				call_count: 2,
			});
		});
	});

	describe("multiple callers scenario", () => {
		it("finds all callers when multiple functions call the same target", () => {
			const result = queryCallers(db, "src/helper.ts:helper");

			expect(result.length).toBeGreaterThanOrEqual(3);
			const callerIds = result.map((n) => n.id).sort();
			expect(callerIds).toContain("src/main.ts:caller");
			expect(callerIds).toContain("src/main.ts:multiCaller");
			expect(callerIds).toContain("src/main.ts:anotherCaller");
		});

		it("each caller appears as separate node in results", () => {
			const result = queryCallers(db, "src/helper.ts:helper");

			const uniqueIds = new Set(result.map((n) => n.id));
			expect(uniqueIds.size).toBe(result.length);
		});
	});

	describe("transitive cross-file calls", () => {
		it("finds direct caller of intermediate function", () => {
			const result = queryCallers(db, "src/chained.ts:intermediate", {
				maxDepth: 1,
			});

			expect(result).toHaveLength(1);
			expect(result[0]?.id).toBe("src/main.ts:chain");
			expect(result[0]?.filePath).toBe("src/main.ts");
		});

		it("finds transitive callers across multiple files", () => {
			const result = queryCallers(db, "src/helper.ts:helper", {
				maxDepth: 100,
			});

			const callerIds = result.map((n) => n.id);
			// Should find both direct callers and transitive ones
			expect(callerIds).toContain("src/chained.ts:intermediate");
			expect(callerIds).toContain("src/main.ts:chain");
		});

		it("finds transitive callees across multiple files", () => {
			const result = queryCallees(db, "src/main.ts:chain", 100);

			const calleeIds = result.map((n) => n.id);
			// chain → intermediate → helper
			expect(calleeIds).toContain("src/chained.ts:intermediate");
			expect(calleeIds).toContain("src/helper.ts:helper");
		});

		it("finds path through intermediate nodes across files", () => {
			const result = queryPath(
				db,
				"src/main.ts:chain",
				"src/helper.ts:helper",
			);

			expect(result).not.toBeNull();
			expect(result?.nodes).toEqual([
				"src/main.ts:chain",
				"src/chained.ts:intermediate",
				"src/helper.ts:helper",
			]);
			expect(result?.edges).toHaveLength(2);
			expect(result?.edges.every((e) => e.type === "CALLS")).toBe(true);
		});
	});
});
