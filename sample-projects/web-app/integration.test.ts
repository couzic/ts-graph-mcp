import type Database from "better-sqlite3";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
	closeDatabase,
	openDatabase,
} from "../../src/db/sqlite/SqliteConnection.js";
import { initializeSchema } from "../../src/db/sqlite/SqliteSchema.js";
import { createSqliteWriter } from "../../src/db/sqlite/SqliteWriter.js";
import { indexProject } from "../../src/ingestion/Ingestion.js";
import { queryEdges } from "../../src/db/queryEdges.js";
import { queryImpactedNodes } from "../../src/tools/analyze-impact/query.js";
import { queryNodes } from "../../src/db/queryNodes.js";
import config from "./ts-graph-mcp.config.js";

/**
 * Integration tests for web-app test project.
 *
 * Structure (flat packages format - single "main" module):
 * - shared package: User, Config interfaces + createUser function
 * - frontend package: UserCard.ts imports User from shared
 * - backend package: userApi.ts imports User, Config and calls createUser from shared
 *
 * PURPOSE: Test cross-PACKAGE edge resolution within a single module.
 * For cross-MODULE testing, see the monorepo sample project.
 *
 * These tests verify that edges crossing package boundaries are correctly extracted:
 * - USES_TYPE: frontend → shared (User type in function signatures)
 * - USES_TYPE: backend → shared (User, Config types)
 * - CALLS: backend → shared (createUser function calls)
 */
describe("web-app integration (cross-package edges)", () => {
	let db: Database.Database;

	beforeAll(async () => {
		db = openDatabase({ path: ":memory:" });
		initializeSchema(db);

		const writer = createSqliteWriter(db);
		await indexProject(config, writer, { projectRoot: import.meta.dirname });
	});

	afterAll(() => {
		closeDatabase(db);
	});

	describe("flat config normalization", () => {
		it("all nodes are in the implicit main module", () => {
			const allNodes = queryNodes(db, "*");
			expect(allNodes.every((n) => n.module === "main")).toBe(true);
		});

		it("nodes are correctly assigned to their packages", () => {
			const sharedNodes = queryNodes(db, "*", { package: "shared" });
			const frontendNodes = queryNodes(db, "*", { package: "frontend" });
			const backendNodes = queryNodes(db, "*", { package: "backend" });

			expect(sharedNodes.length).toBeGreaterThan(0);
			expect(frontendNodes.length).toBeGreaterThan(0);
			expect(backendNodes.length).toBeGreaterThan(0);
		});
	});

	describe("node extraction", () => {
		it("extracts nodes from shared package", () => {
			const result = queryNodes(db, "*", { package: "shared" });

			const names = result.map((n) => n.name);
			expect(names).toContain("User");
			expect(names).toContain("Config");
			expect(names).toContain("createUser");
		});

		it("extracts nodes from frontend package", () => {
			const result = queryNodes(db, "*", { package: "frontend" });

			const names = result.map((n) => n.name);
			expect(names).toContain("UserCardProps");
			expect(names).toContain("renderUserCard");
			expect(names).toContain("formatUserName");
		});

		it("extracts nodes from backend package", () => {
			const result = queryNodes(db, "*", { package: "backend" });

			const names = result.map((n) => n.name);
			expect(names).toContain("getUser");
			expect(names).toContain("listUsers");
			expect(names).toContain("getConfig");
		});
	});

	describe("cross-package USES_TYPE edges", () => {
		it("creates USES_TYPE edge from frontend formatUserName to shared User", () => {
			const edges = queryEdges(db, {
				type: "USES_TYPE",
				sourcePattern: "*formatUserName*",
				targetPattern: "*User",
			});

			expect(edges.length).toBeGreaterThan(0);
			expect(edges[0]?.target).toContain("shared");
			expect(edges[0]?.context).toBe("parameter");
		});

		it("creates USES_TYPE edge from backend getUser to shared User", () => {
			const edges = queryEdges(db, {
				type: "USES_TYPE",
				sourcePattern: "*getUser*",
				targetPattern: "*User",
			});

			expect(edges.length).toBeGreaterThan(0);
			expect(edges[0]?.target).toContain("shared");
			expect(edges[0]?.context).toBe("return");
		});

		it("creates USES_TYPE edge from backend getConfig to shared Config", () => {
			const edges = queryEdges(db, {
				type: "USES_TYPE",
				sourcePattern: "*getConfig*",
				targetPattern: "*Config",
			});

			expect(edges.length).toBeGreaterThan(0);
			expect(edges[0]?.target).toContain("shared");
		});
	});

	describe("cross-package CALLS edges", () => {
		it("creates CALLS edge from backend getUser to shared createUser", () => {
			const edges = queryEdges(db, {
				type: "CALLS",
				sourcePattern: "*getUser*",
				targetPattern: "*createUser*",
			});

			expect(edges.length).toBeGreaterThan(0);
			expect(edges[0]?.target).toContain("shared");
		});

		it("creates CALLS edge from backend listUsers to shared createUser with call_count 2", () => {
			const edges = queryEdges(db, {
				type: "CALLS",
				sourcePattern: "*listUsers*",
				targetPattern: "*createUser*",
			});

			expect(edges.length).toBeGreaterThan(0);
			expect(edges[0]?.target).toContain("shared");
			expect(edges[0]?.callCount).toBe(2);
		});
	});

	describe("cross-package impact analysis", () => {
		it("analyzeImpact on shared User shows frontend dependents", () => {
			const userNode = queryNodes(db, "User", {
				package: "shared",
				type: "Interface",
			})[0];

			expect(userNode).toBeDefined();

			const impacted = queryImpactedNodes(db, userNode!.id, {
				maxDepth: 5,
			});

			const impactedNames = impacted.map((n) => n.name);
			expect(impactedNames).toContain("formatUserName");
		});

		it("analyzeImpact on shared User shows backend dependents", () => {
			const userNode = queryNodes(db, "User", {
				package: "shared",
				type: "Interface",
			})[0];

			expect(userNode).toBeDefined();

			const impacted = queryImpactedNodes(db, userNode!.id, {
				maxDepth: 5,
			});

			const impactedNames = impacted.map((n) => n.name);
			expect(impactedNames).toContain("getUser");
			expect(impactedNames).toContain("listUsers");
		});

		it("analyzeImpact on shared User shows dependents from BOTH frontend AND backend packages", () => {
			const userNode = queryNodes(db, "User", {
				package: "shared",
				type: "Interface",
			})[0];

			expect(userNode).toBeDefined();

			const impacted = queryImpactedNodes(db, userNode!.id, {
				maxDepth: 5,
			});

			const packages = [...new Set(impacted.map((n) => n.package))];

			// Key assertion: Impact analysis on shared types shows dependents from multiple packages
			expect(packages).toContain("frontend");
			expect(packages).toContain("backend");
		});

		it("analyzeImpact on shared createUser shows backend callers", () => {
			const createUserNode = queryNodes(db, "createUser", {
				package: "shared",
				type: "Function",
			})[0];

			expect(createUserNode).toBeDefined();

			const impacted = queryImpactedNodes(db, createUserNode!.id, {
				maxDepth: 5,
			});

			const impactedNames = impacted.map((n) => n.name);
			expect(impactedNames).toContain("getUser");
			expect(impactedNames).toContain("listUsers");
		});
	});

	describe("package filtering", () => {
		it("queryNodes with package filter returns only that package", () => {
			const sharedNodes = queryNodes(db, "*", { package: "shared" });
			const frontendNodes = queryNodes(db, "*", { package: "frontend" });
			const backendNodes = queryNodes(db, "*", { package: "backend" });

			expect(sharedNodes.every((n) => n.package === "shared")).toBe(true);
			expect(frontendNodes.every((n) => n.package === "frontend")).toBe(true);
			expect(backendNodes.every((n) => n.package === "backend")).toBe(true);
		});
	});

	describe("node integrity (regression tests)", () => {
		it("has no duplicate node IDs", () => {
			const allNodes = queryNodes(db, "*");
			const ids = allNodes.map((n) => n.id);
			const uniqueIds = new Set(ids);

			expect(ids.length).toBe(uniqueIds.size);
		});

		it("assigns correct package based on file path", () => {
			const allNodes = queryNodes(db, "*");

			for (const node of allNodes) {
				if (node.filePath.startsWith("shared/")) {
					expect(node.package).toBe("shared");
				} else if (node.filePath.startsWith("frontend/")) {
					expect(node.package).toBe("frontend");
				} else if (node.filePath.startsWith("backend/")) {
					expect(node.package).toBe("backend");
				}
			}
		});
	});

	describe("edge summary (diagnostic)", () => {
		it("logs all nodes and their packages for debugging", () => {
			const allNodes = queryNodes(db, "*");

			console.log("\n=== Node Summary ===");
			console.log(`Total nodes: ${allNodes.length}`);

			// Group by package
			const byPackage = allNodes.reduce(
				(acc, n) => {
					acc[n.package] = acc[n.package] || [];
					acc[n.package].push(n);
					return acc;
				},
				{} as Record<string, typeof allNodes>,
			);

			console.log("\nNodes by package:");
			for (const [pkg, nodes] of Object.entries(byPackage)) {
				console.log(`  ${pkg}: ${nodes.length} nodes`);
				for (const n of nodes.slice(0, 5)) {
					console.log(`    - ${n.type} ${n.name} (${n.filePath})`);
				}
				if (nodes.length > 5) {
					console.log(`    ... and ${nodes.length - 5} more`);
				}
			}

			expect(allNodes.length).toBeGreaterThan(0);
		});

		it("logs cross-package edges for debugging", () => {
			const allEdges = queryEdges(db, {});

			// Count edges by type
			const edgeCounts = allEdges.reduce(
				(acc, e) => {
					acc[e.type] = (acc[e.type] || 0) + 1;
					return acc;
				},
				{} as Record<string, number>,
			);

			console.log("\n=== Edge Summary ===");
			console.log("Edge counts by type:", edgeCounts);

			// Count cross-package edges
			const crossPackageEdges = allEdges.filter((e) => {
				const sourcePackage = e.source.startsWith("shared/")
					? "shared"
					: e.source.startsWith("frontend/")
						? "frontend"
						: e.source.startsWith("backend/")
							? "backend"
							: "unknown";
				const targetPackage = e.target.startsWith("shared/")
					? "shared"
					: e.target.startsWith("frontend/")
						? "frontend"
						: e.target.startsWith("backend/")
							? "backend"
							: "unknown";
				return sourcePackage !== targetPackage;
			});

			console.log(`Cross-package edges: ${crossPackageEdges.length}`);
			for (const e of crossPackageEdges) {
				console.log(`  ${e.type}: ${e.source} → ${e.target}`);
			}

			// Cross-package edges should be created
			expect(crossPackageEdges.length).toBeGreaterThan(0);
		});
	});
});
