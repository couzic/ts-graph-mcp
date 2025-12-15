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
import { queryFileNodes } from "../../src/tools/get-file-symbols/query.js";
import { queryImpactedNodes } from "../../src/tools/get-impact/query.js";
import { queryNeighbors } from "../../src/tools/get-neighbors/query.js";
import { querySearchNodes } from "../../src/tools/search-nodes/query.js";

/**
 * Integration tests for call-chain test project.
 * Tests: funcA → funcB → funcC (same file call chain)
 */
describe("call-chain integration", () => {
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
		it("finds funcB as direct caller of funcC", () => {
			const result = queryCallers(db, "src/chain.ts:funcC", { maxDepth: 1 });

			expect(result).toHaveLength(1);
			expect(result[0]?.id).toBe("src/chain.ts:funcB");
			expect(result[0]?.name).toBe("funcB");
			expect(result[0]?.type).toBe("Function");
		});

		it("finds funcB and funcA as transitive callers of funcC", () => {
			const result = queryCallers(db, "src/chain.ts:funcC", { maxDepth: 100 });

			expect(result).toHaveLength(2);
			const ids = result.map((n) => n.id).sort();
			expect(ids).toEqual(["src/chain.ts:funcA", "src/chain.ts:funcB"]);
		});
	});

	describe(queryCallees.name, () => {
		it("finds funcB as callee of funcA", () => {
			const result = queryCallees(db, "src/chain.ts:funcA", 1);

			expect(result).toHaveLength(1);
			expect(result[0]?.id).toBe("src/chain.ts:funcB");
			expect(result[0]?.name).toBe("funcB");
		});

		it("finds funcB and funcC as transitive callees of funcA", () => {
			const result = queryCallees(db, "src/chain.ts:funcA", 100);

			expect(result).toHaveLength(2);
			const ids = result.map((n) => n.id).sort();
			expect(ids).toEqual(["src/chain.ts:funcB", "src/chain.ts:funcC"]);
		});
	});

	describe(queryPath.name, () => {
		it("finds path from funcA to funcC through funcB", () => {
			const result = queryPath(db, "src/chain.ts:funcA", "src/chain.ts:funcC");

			expect(result).not.toBeNull();
			expect(result?.nodes).toEqual([
				"src/chain.ts:funcA",
				"src/chain.ts:funcB",
				"src/chain.ts:funcC",
			]);
			expect(result?.edges).toHaveLength(2);
		});

		it("returns null for path in wrong direction", () => {
			const result = queryPath(db, "src/chain.ts:funcC", "src/chain.ts:funcA");

			expect(result).toBeNull();
		});
	});

	describe(queryFileNodes.name, () => {
		it("finds all nodes in the file (File node + 3 functions)", () => {
			const result = queryFileNodes(db, "src/chain.ts");

			expect(result).toHaveLength(4);

			const fileNode = result.find((n) => n.type === "File");
			expect(fileNode).toBeDefined();
			expect(fileNode?.name).toBe("chain.ts");

			const functions = result.filter((n) => n.type === "Function");
			expect(functions).toHaveLength(3);
			const functionNames = functions.map((n) => n.name).sort();
			expect(functionNames).toEqual(["funcA", "funcB", "funcC"]);

			for (const fn of functions) {
				expect(fn.exported).toBe(true);
			}
		});
	});

	describe(queryImpactedNodes.name, () => {
		it("finds funcB impacted by changes to funcC (CALLS edges only)", () => {
			const result = queryImpactedNodes(db, "src/chain.ts:funcC", {
				maxDepth: 1,
				edgeTypes: ["CALLS"],
			});

			expect(result).toHaveLength(1);
			expect(result[0]?.id).toBe("src/chain.ts:funcB");
		});

		it("finds funcB and funcA impacted by changes to funcC (CALLS edges only)", () => {
			const result = queryImpactedNodes(db, "src/chain.ts:funcC", {
				maxDepth: 100,
				edgeTypes: ["CALLS"],
			});

			expect(result).toHaveLength(2);
			const ids = result.map((n) => n.id).sort();
			expect(ids).toEqual(["src/chain.ts:funcA", "src/chain.ts:funcB"]);
		});

		it("finds funcA impacted by changes to funcB (CALLS edges only)", () => {
			const result = queryImpactedNodes(db, "src/chain.ts:funcB", {
				maxDepth: 100,
				edgeTypes: ["CALLS"],
			});

			expect(result).toHaveLength(1);
			expect(result[0]?.id).toBe("src/chain.ts:funcA");
		});

		it("includes File node when CONTAINS edges included", () => {
			const result = queryImpactedNodes(db, "src/chain.ts:funcC", {
				maxDepth: 1,
			});

			expect(result.length).toBeGreaterThan(1);
			const types = result.map((n) => n.type);
			expect(types).toContain("Function");
			expect(types).toContain("File");
		});
	});

	describe(queryNeighbors.name, () => {
		it("finds funcB's outgoing neighbors (includes center + funcC)", () => {
			const result = queryNeighbors(db, "src/chain.ts:funcB", 1, "outgoing");

			expect(result.center.id).toBe("src/chain.ts:funcB");
			expect(result.nodes).toHaveLength(2);

			const ids = result.nodes.map((n) => n.id).sort();
			expect(ids).toEqual(["src/chain.ts:funcB", "src/chain.ts:funcC"]);

			expect(result.edges).toHaveLength(1);
			expect(result.edges[0]?.source).toBe("src/chain.ts:funcB");
			expect(result.edges[0]?.target).toBe("src/chain.ts:funcC");
		});

		it("finds funcB's incoming neighbors (includes center + funcA + File)", () => {
			const result = queryNeighbors(db, "src/chain.ts:funcB", 1, "incoming");

			expect(result.center.id).toBe("src/chain.ts:funcB");
			expect(result.nodes.length).toBeGreaterThanOrEqual(2);

			const nodeIds = result.nodes.map((n) => n.id);
			expect(nodeIds).toContain("src/chain.ts:funcB");
			expect(nodeIds).toContain("src/chain.ts:funcA");
		});

		it("finds funcB's bidirectional neighbors (includes center + funcA + funcC + File)", () => {
			const result = queryNeighbors(db, "src/chain.ts:funcB", 1, "both");

			expect(result.center.id).toBe("src/chain.ts:funcB");
			expect(result.nodes.length).toBeGreaterThanOrEqual(3);

			const nodeIds = result.nodes.map((n) => n.id);
			expect(nodeIds).toContain("src/chain.ts:funcB");
			expect(nodeIds).toContain("src/chain.ts:funcA");
			expect(nodeIds).toContain("src/chain.ts:funcC");
		});
	});

	describe(querySearchNodes.name, () => {
		it("finds all functions with func* pattern", () => {
			const result = querySearchNodes(db, "func*");

			expect(result).toHaveLength(3);
			const names = result.map((n) => n.name).sort();
			expect(names).toEqual(["funcA", "funcB", "funcC"]);
		});

		it("finds only funcB with exact pattern", () => {
			const result = querySearchNodes(db, "funcB");

			expect(result).toHaveLength(1);
			expect(result[0]?.name).toBe("funcB");
		});

		it("finds functions with wildcard in middle", () => {
			const result = querySearchNodes(db, "func?");

			expect(result).toHaveLength(3);
		});

		it("filters by node type", () => {
			const result = querySearchNodes(db, "func*", { nodeType: "Function" });

			expect(result).toHaveLength(3);
			for (const node of result) {
				expect(node.type).toBe("Function");
			}
		});
	});
});
