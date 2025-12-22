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
import { queryCallees } from "../../src/tools/outgoing-calls-deep/query.js";
import { queryCallers } from "../../src/tools/incoming-calls-deep/query.js";
import { queryPath } from "../../src/tools/find-path/query.js";
import { queryImpactedNodes } from "../../src/tools/analyze-impact/query.js";
import { queryNodes } from "../../src/db/queryNodes.js";
import { queryEdges } from "../../src/db/queryEdges.js";

// Helper to get all nodes in a file (replacement for deprecated queryFileNodes)
function queryFileNodes(db: Database.Database, filePath: string) {
	return queryNodes(db, "*").filter((n) => n.filePath === filePath);
}

/**
 * Integration tests for deep-chain test project.
 * Tests: entry → step02 → step03 → ... → step10 (10-hop cross-file call chain)
 *
 * Primary purpose: Stress-test deep transitive traversal and benchmark MCP tools
 * vs manual file reading for understanding call chains.
 */
describe("deep-chain integration", () => {
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

	describe(queryCallees.name, () => {
		it("finds step02 as direct callee of entry", () => {
			const result = queryCallees(db, "src/step01.ts:entry", 1);

			expect(result).toHaveLength(1);
			expect(result[0]?.id).toBe("src/step02.ts:step02");
			expect(result[0]?.name).toBe("step02");
			expect(result[0]?.filePath).toBe("src/step02.ts");
		});

		it("finds all 9 callees transitively from entry at depth 10", () => {
			const result = queryCallees(db, "src/step01.ts:entry", 10);

			expect(result).toHaveLength(9);
			const ids = result.map((n) => n.id).sort();
			expect(ids).toEqual([
				"src/step02.ts:step02",
				"src/step03.ts:step03",
				"src/step04.ts:step04",
				"src/step05.ts:step05",
				"src/step06.ts:step06",
				"src/step07.ts:step07",
				"src/step08.ts:step08",
				"src/step09.ts:step09",
				"src/step10.ts:step10",
			]);
		});

		it("finds partial callees at limited depth", () => {
			const result = queryCallees(db, "src/step01.ts:entry", 3);

			expect(result).toHaveLength(3);
			const ids = result.map((n) => n.id).sort();
			expect(ids).toEqual([
				"src/step02.ts:step02",
				"src/step03.ts:step03",
				"src/step04.ts:step04",
			]);
		});

		it("returns empty for terminal node (step10)", () => {
			const result = queryCallees(db, "src/step10.ts:step10", 100);

			expect(result).toHaveLength(0);
		});
	});

	describe(queryCallers.name, () => {
		it("finds step09 as direct caller of step10", () => {
			const result = queryCallers(db, "src/step10.ts:step10", { maxDepth: 1 });

			expect(result).toHaveLength(1);
			expect(result[0]?.id).toBe("src/step09.ts:step09");
			expect(result[0]?.name).toBe("step09");
		});

		it("finds all 9 callers transitively of step10 at depth 10", () => {
			const result = queryCallers(db, "src/step10.ts:step10", { maxDepth: 10 });

			expect(result).toHaveLength(9);
			const ids = result.map((n) => n.id).sort();
			expect(ids).toEqual([
				"src/step01.ts:entry",
				"src/step02.ts:step02",
				"src/step03.ts:step03",
				"src/step04.ts:step04",
				"src/step05.ts:step05",
				"src/step06.ts:step06",
				"src/step07.ts:step07",
				"src/step08.ts:step08",
				"src/step09.ts:step09",
			]);
		});

		it("returns empty for entry point (no callers)", () => {
			const result = queryCallers(db, "src/step01.ts:entry", { maxDepth: 100 });

			expect(result).toHaveLength(0);
		});
	});

	describe(queryPath.name, () => {
		it("finds 10-node path from entry to step10", () => {
			const result = queryPath(
				db,
				"src/step01.ts:entry",
				"src/step10.ts:step10",
			);

			expect(result).not.toBeNull();
			expect(result?.nodes).toHaveLength(10);
			expect(result?.nodes).toEqual([
				"src/step01.ts:entry",
				"src/step02.ts:step02",
				"src/step03.ts:step03",
				"src/step04.ts:step04",
				"src/step05.ts:step05",
				"src/step06.ts:step06",
				"src/step07.ts:step07",
				"src/step08.ts:step08",
				"src/step09.ts:step09",
				"src/step10.ts:step10",
			]);
			expect(result?.edges).toHaveLength(9);
			expect(result?.edges.every((e) => e.type === "CALLS")).toBe(true);
		});

		it("finds shorter path from midpoint", () => {
			const result = queryPath(
				db,
				"src/step05.ts:step05",
				"src/step10.ts:step10",
			);

			expect(result).not.toBeNull();
			expect(result?.nodes).toHaveLength(6);
			expect(result?.nodes[0]).toBe("src/step05.ts:step05");
			expect(result?.nodes[5]).toBe("src/step10.ts:step10");
		});

		it("returns null for path in wrong direction", () => {
			const result = queryPath(
				db,
				"src/step10.ts:step10",
				"src/step01.ts:entry",
			);

			expect(result).toBeNull();
		});
	});

	describe(queryFileNodes.name, () => {
		it("finds File node + function in each step file", () => {
			const result = queryFileNodes(db, "src/step05.ts");

			expect(result).toHaveLength(2);

			const fileNode = result.find((n) => n.type === "File");
			expect(fileNode).toBeDefined();
			expect(fileNode?.name).toBe("step05.ts");

			const funcNode = result.find((n) => n.type === "Function");
			expect(funcNode).toBeDefined();
			expect(funcNode?.name).toBe("step05");
			expect(funcNode?.exported).toBe(true);
		});
	});

	describe(queryImpactedNodes.name, () => {
		it("finds all callers impacted by changes to step10", () => {
			const result = queryImpactedNodes(db, "src/step10.ts:step10", {
				maxDepth: 10,
			});

			const ids = result.map((n) => n.id);
			// All 9 step functions that transitively call step10
			expect(ids).toContain("src/step01.ts:entry");
			expect(ids).toContain("src/step09.ts:step09");
			expect(ids).toContain("src/step02.ts:step02");
		});

		it("respects maxDepth for impact analysis", () => {
			const result = queryImpactedNodes(db, "src/step10.ts:step10", {
				maxDepth: 2,
			});

			const ids = result.map((n) => n.id);
			// Only direct and 1-hop transitive callers
			expect(ids).toContain("src/step09.ts:step09");
			expect(ids).toContain("src/step08.ts:step08");
			// Should NOT include deeper callers
			expect(ids).not.toContain("src/step01.ts:entry");
		});
	});

	describe(queryNodes.name, () => {
		it("finds all step functions with step* pattern (filtered by type)", () => {
			const result = queryNodes(db, "step*", { type: "Function" });

			expect(result).toHaveLength(9);
			const names = result.map((n) => n.name).sort();
			expect(names).toEqual([
				"step02",
				"step03",
				"step04",
				"step05",
				"step06",
				"step07",
				"step08",
				"step09",
				"step10",
			]);
		});

		it("finds all step files and functions without type filter", () => {
			const result = queryNodes(db, "step*");

			// 10 File nodes (step01.ts - step10.ts) + 9 Function nodes (step02 - step10)
			expect(result).toHaveLength(19);
		});

		it("finds entry function", () => {
			const result = queryNodes(db, "entry");

			expect(result).toHaveLength(1);
			expect(result[0]?.name).toBe("entry");
			expect(result[0]?.filePath).toBe("src/step01.ts");
		});

		it("finds specific step with exact pattern", () => {
			const result = queryNodes(db, "step05");

			expect(result).toHaveLength(1);
			expect(result[0]?.name).toBe("step05");
		});
	});

	describe("cross-file edge verification", () => {
		it("creates CALLS edges across all 10 files", () => {
			const edges = queryEdges(db, { type: "CALLS" });

			expect(edges).toHaveLength(9);

			const expectedEdges = [
				["src/step01.ts:entry", "src/step02.ts:step02"],
				["src/step02.ts:step02", "src/step03.ts:step03"],
				["src/step03.ts:step03", "src/step04.ts:step04"],
				["src/step04.ts:step04", "src/step05.ts:step05"],
				["src/step05.ts:step05", "src/step06.ts:step06"],
				["src/step06.ts:step06", "src/step07.ts:step07"],
				["src/step07.ts:step07", "src/step08.ts:step08"],
				["src/step08.ts:step08", "src/step09.ts:step09"],
				["src/step09.ts:step09", "src/step10.ts:step10"],
			];

			for (const [source, target] of expectedEdges) {
				const edge = edges.find(
					(e) => e.source === source && e.target === target,
				);
				expect(edge).toBeDefined();
			}
		});
	});
});
