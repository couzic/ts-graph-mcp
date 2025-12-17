import type Database from "better-sqlite3";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { ProjectConfig } from "../../dist/config/ConfigSchema.js";
import {
	closeDatabase,
	openDatabase,
} from "../../dist/db/sqlite/SqliteConnection.js";
import { initializeSchema } from "../../dist/db/sqlite/SqliteSchema.js";
import { createSqliteWriter } from "../../dist/db/sqlite/SqliteWriter.js";
import { indexProject } from "../../dist/ingestion/Ingestion.js";
import { queryImpactedNodes } from "../../dist/tools/get-impact/query.js";
import { querySearchNodes } from "../../dist/tools/search-nodes/query.js";

/**
 * Integration tests for web-app test project.
 *
 * Structure (multi-module):
 * - shared: User, Config interfaces + createUser function
 * - frontend: UserCard.ts imports User from shared
 * - backend: userApi.ts imports User, Config and calls createUser from shared
 *
 * PURPOSE: Test cross-module edge resolution (Issue #5).
 *
 * These tests verify that edges crossing module boundaries are correctly extracted:
 * - USES_TYPE: frontend → shared (User type in function signatures)
 * - USES_TYPE: backend → shared (User, Config types)
 * - CALLS: backend → shared (createUser function calls)
 *
 * Note: This is a simplified multi-module structure (1 package per module).
 * See PLANNED.md for a full monorepo test with multiple packages per module.
 */
describe("web-app integration (Issue #5: cross-module edges)", () => {
	let db: Database.Database;

	beforeAll(async () => {
		db = openDatabase({ path: ":memory:" });
		initializeSchema(db);

		const projectRoot = import.meta.dirname;
		const config: ProjectConfig = {
			modules: [
				{
					name: "shared",
					packages: [{ name: "shared", tsconfig: "./shared/tsconfig.json" }],
				},
				{
					name: "frontend",
					packages: [
						{ name: "frontend", tsconfig: "./frontend/tsconfig.json" },
					],
				},
				{
					name: "backend",
					packages: [{ name: "backend", tsconfig: "./backend/tsconfig.json" }],
				},
			],
		};
		const writer = createSqliteWriter(db);
		await indexProject(config, writer, { projectRoot });
	});

	afterAll(() => {
		closeDatabase(db);
	});

	describe("node extraction (should pass)", () => {
		it("extracts nodes from shared module", () => {
			const result = querySearchNodes(db, "*", { module: "shared" });

			const names = result.map((n) => n.name);
			expect(names).toContain("User");
			expect(names).toContain("Config");
			expect(names).toContain("createUser");
		});

		it("extracts nodes from frontend module", () => {
			const result = querySearchNodes(db, "*", { module: "frontend" });

			const names = result.map((n) => n.name);
			expect(names).toContain("UserCardProps");
			expect(names).toContain("renderUserCard");
			expect(names).toContain("formatUserName");
		});

		it("extracts nodes from backend module", () => {
			const result = querySearchNodes(db, "*", { module: "backend" });

			const names = result.map((n) => n.name);
			expect(names).toContain("getUser");
			expect(names).toContain("listUsers");
			expect(names).toContain("getConfig");
		});
	});

	describe("cross-module USES_TYPE edges (Issue #5)", () => {
		/**
		 * frontend/src/UserCard.ts has:
		 *   - UserCardProps interface with `user: User` property
		 *   - renderUserCard(props: UserCardProps) - indirect User usage
		 *   - formatUserName(user: User) - direct User usage in parameter
		 *
		 * Expected USES_TYPE edges:
		 *   frontend:formatUserName → shared:User (parameter type)
		 *
		 * Note: Interface property types (UserCardProps.user: User) don't
		 * currently create USES_TYPE edges. This is a potential enhancement,
		 * not part of Issue #5 (cross-module edge resolution).
		 */

		it("creates USES_TYPE edge from frontend formatUserName to shared User", () => {
			const edges = db
				.prepare(
					`
					SELECT source, target, type, context
					FROM edges
					WHERE type = 'USES_TYPE'
					  AND source LIKE '%formatUserName%'
					  AND target LIKE '%User'
				`,
				)
				.all() as Array<{
				source: string;
				target: string;
				type: string;
				context: string | null;
			}>;

			expect(edges.length).toBeGreaterThan(0);
			expect(edges[0]?.target).toContain("shared");
			expect(edges[0]?.context).toBe("parameter");
		});

		/**
		 * backend/src/userApi.ts has:
		 *   - getUser(id: string): User | null
		 *   - listUsers(): User[]
		 *   - getConfig(): Config
		 *
		 * Expected USES_TYPE edges:
		 *   backend:getUser → shared:User (return type)
		 *   backend:listUsers → shared:User (return type)
		 *   backend:getConfig → shared:Config (return type)
		 */
		it("creates USES_TYPE edge from backend getUser to shared User", () => {
			const edges = db
				.prepare(
					`
					SELECT source, target, type, context
					FROM edges
					WHERE type = 'USES_TYPE'
					  AND source LIKE '%getUser%'
					  AND target LIKE '%User'
				`,
				)
				.all() as Array<{
				source: string;
				target: string;
				type: string;
				context: string | null;
			}>;

			expect(edges.length).toBeGreaterThan(0);
			expect(edges[0]?.target).toContain("shared");
			expect(edges[0]?.context).toBe("return");
		});

		it("creates USES_TYPE edge from backend getConfig to shared Config", () => {
			const edges = db
				.prepare(
					`
					SELECT source, target, type, context
					FROM edges
					WHERE type = 'USES_TYPE'
					  AND source LIKE '%getConfig%'
					  AND target LIKE '%Config'
				`,
				)
				.all() as Array<{
				source: string;
				target: string;
				type: string;
				context: string | null;
			}>;

			expect(edges.length).toBeGreaterThan(0);
			expect(edges[0]?.target).toContain("shared");
		});
	});

	describe("cross-module CALLS edges (Issue #5)", () => {
		/**
		 * backend/src/userApi.ts calls createUser from shared:
		 *   - getUser calls createUser("John Doe", ...)
		 *   - listUsers calls createUser twice
		 *
		 * Expected CALLS edges:
		 *   backend:getUser → shared:createUser
		 *   backend:listUsers → shared:createUser
		 */
		it("creates CALLS edge from backend getUser to shared createUser", () => {
			const edges = db
				.prepare(
					`
					SELECT source, target, type, call_count
					FROM edges
					WHERE type = 'CALLS'
					  AND source LIKE '%getUser%'
					  AND target LIKE '%createUser%'
				`,
				)
				.all() as Array<{
				source: string;
				target: string;
				type: string;
				call_count: number;
			}>;

			expect(edges.length).toBeGreaterThan(0);
			expect(edges[0]?.target).toContain("shared");
		});

		it("creates CALLS edge from backend listUsers to shared createUser with call_count 2", () => {
			const edges = db
				.prepare(
					`
					SELECT source, target, type, call_count
					FROM edges
					WHERE type = 'CALLS'
					  AND source LIKE '%listUsers%'
					  AND target LIKE '%createUser%'
				`,
				)
				.all() as Array<{
				source: string;
				target: string;
				type: string;
				call_count: number;
			}>;

			expect(edges.length).toBeGreaterThan(0);
			expect(edges[0]?.target).toContain("shared");
			expect(edges[0]?.call_count).toBe(2);
		});
	});

	describe("cross-module impact analysis (Issue #5)", () => {
		/**
		 * get_impact(shared/User) should return all code affected by changes to User:
		 *   - frontend:UserCardProps (has user: User property)
		 *   - frontend:formatUserName (has User parameter)
		 *   - backend:getUser (returns User)
		 *   - backend:listUsers (returns User[])
		 */
		it("get_impact on shared User shows frontend dependents", () => {
			const userNode = querySearchNodes(db, "User", {
				module: "shared",
				nodeType: "Interface",
			})[0];

			expect(userNode).toBeDefined();

			const impacted = queryImpactedNodes(db, userNode!.id, {
				maxDepth: 5,
				edgeTypes: ["USES_TYPE"],
			});

			const impactedNames = impacted.map((n) => n.name);
			expect(impactedNames).toContain("formatUserName");
		});

		it("get_impact on shared User shows backend dependents", () => {
			const userNode = querySearchNodes(db, "User", {
				module: "shared",
				nodeType: "Interface",
			})[0];

			expect(userNode).toBeDefined();

			const impacted = queryImpactedNodes(db, userNode!.id, {
				maxDepth: 5,
				edgeTypes: ["USES_TYPE"],
			});

			const impactedNames = impacted.map((n) => n.name);
			expect(impactedNames).toContain("getUser");
			expect(impactedNames).toContain("listUsers");
		});

		it("get_impact on shared User shows BOTH frontend AND backend dependents", () => {
			const userNode = querySearchNodes(db, "User", {
				module: "shared",
				nodeType: "Interface",
			})[0];

			expect(userNode).toBeDefined();

			const impacted = queryImpactedNodes(db, userNode!.id, {
				maxDepth: 5,
				edgeTypes: ["USES_TYPE"],
			});

			const modules = [...new Set(impacted.map((n) => n.module))];

			// This is the key assertion for Issue #5:
			// Impact analysis on shared types should show dependents from BOTH modules
			expect(modules).toContain("frontend");
			expect(modules).toContain("backend");
		});

		it("get_impact on shared createUser shows backend callers", () => {
			const createUserNode = querySearchNodes(db, "createUser", {
				module: "shared",
				nodeType: "Function",
			})[0];

			expect(createUserNode).toBeDefined();

			const impacted = queryImpactedNodes(db, createUserNode!.id, {
				maxDepth: 5,
				edgeTypes: ["CALLS"],
			});

			const impactedNames = impacted.map((n) => n.name);
			expect(impactedNames).toContain("getUser");
			expect(impactedNames).toContain("listUsers");
		});
	});

	describe("module filtering (should pass)", () => {
		it("search_nodes with module filter returns only that module", () => {
			const sharedNodes = querySearchNodes(db, "*", { module: "shared" });
			const frontendNodes = querySearchNodes(db, "*", { module: "frontend" });
			const backendNodes = querySearchNodes(db, "*", { module: "backend" });

			expect(sharedNodes.every((n) => n.module === "shared")).toBe(true);
			expect(frontendNodes.every((n) => n.module === "frontend")).toBe(true);
			expect(backendNodes.every((n) => n.module === "backend")).toBe(true);
		});
	});

	describe("edge summary (diagnostic)", () => {
		/**
		 * This test shows what nodes exist and their module assignments.
		 * Helps debug why module filtering might not work.
		 */
		it("logs all nodes and their modules for debugging", () => {
			const allNodes = db
				.prepare(
					`
					SELECT id, name, type, module, package, file_path
					FROM nodes
					ORDER BY module, file_path, name
				`,
				)
				.all() as Array<{
				id: string;
				name: string;
				type: string;
				module: string;
				package: string;
				file_path: string;
			}>;

			console.log("\n=== Node Summary ===");
			console.log(`Total nodes: ${allNodes.length}`);

			// Group by module
			const byModule = allNodes.reduce(
				(acc, n) => {
					acc[n.module] = acc[n.module] || [];
					acc[n.module].push(n);
					return acc;
				},
				{} as Record<string, typeof allNodes>,
			);

			console.log("\nNodes by module:");
			for (const [module, nodes] of Object.entries(byModule)) {
				console.log(`  ${module}: ${nodes.length} nodes`);
				for (const n of nodes.slice(0, 5)) {
					console.log(`    - ${n.type} ${n.name} (${n.file_path})`);
				}
				if (nodes.length > 5) {
					console.log(`    ... and ${nodes.length - 5} more`);
				}
			}

			// Check if any nodes should be in "shared" but aren't
			const shouldBeShared = allNodes.filter(
				(n) =>
					n.file_path.startsWith("shared/") || n.id.startsWith("shared/"),
			);
			console.log(
				`\nNodes with 'shared' in path (expected module=shared): ${shouldBeShared.length}`,
			);
			for (const n of shouldBeShared) {
				console.log(`  ${n.module}/${n.package}: ${n.name} (${n.file_path})`);
			}

			expect(allNodes.length).toBeGreaterThan(0);
		});

		/**
		 * This test provides diagnostic output to understand what edges were created.
		 * Useful for debugging Issue #5.
		 */
		it("logs all edges for debugging", () => {
			const allEdges = db
				.prepare(
					`
					SELECT source, target, type
					FROM edges
					ORDER BY type, source
				`,
				)
				.all() as Array<{ source: string; target: string; type: string }>;

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

			// Count cross-module edges
			const crossModuleEdges = allEdges.filter((e) => {
				const sourceModule = e.source.startsWith("shared/")
					? "shared"
					: e.source.startsWith("frontend/")
						? "frontend"
						: e.source.startsWith("backend/")
							? "backend"
							: "unknown";
				const targetModule = e.target.startsWith("shared/")
					? "shared"
					: e.target.startsWith("frontend/")
						? "frontend"
						: e.target.startsWith("backend/")
							? "backend"
							: "unknown";
				return sourceModule !== targetModule;
			});

			console.log(`Cross-module edges: ${crossModuleEdges.length}`);
			for (const e of crossModuleEdges) {
				console.log(`  ${e.type}: ${e.source} → ${e.target}`);
			}

			// This assertion documents the expected state when Issue #5 is fixed
			// Currently fails because cross-module edges are dropped
			expect(
				crossModuleEdges.length,
				"Cross-module edges should exist when Issue #5 is fixed",
			).toBeGreaterThan(0);
		});
	});
});
