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
import { queryNodes } from "../../src/db/queryNodes.js";
import { queryEdges } from "../../src/db/queryEdges.js";

/**
 * Integration tests for layered-api test project.
 *
 * Structure (layered architecture with functions):
 * src/
 * ├── routes/
 * │   ├── userRoutes.ts    → exports registerUserRoutes, calls handleGetUser etc.
 * │   └── orderRoutes.ts   → exports registerOrderRoutes, calls handleCreateOrder etc.
 * ├── controllers/
 * │   ├── UserController.ts  → exports handleGetUser etc., calls getUserById etc.
 * │   └── OrderController.ts → exports handleCreateOrder etc., calls placeOrder etc.
 * ├── services/
 * │   ├── UserService.ts   → exports getUserById etc., calls findUserById etc.
 * │   └── OrderService.ts  → exports placeOrder etc., calls createOrder + getUserById
 * ├── repositories/
 * │   ├── UserRepository.ts  → exports findUserById etc., calls query/execute
 * │   └── OrderRepository.ts → exports createOrder etc., calls query/execute
 * └── db/
 *     └── Database.ts      → exports query, execute, transaction (leaf nodes)
 *
 * Tests verify the 5-layer call chain: routes → controllers → services → repos → db
 */
describe("layered-api integration (layered architecture)", () => {
	let db: Database.Database;

	beforeAll(async () => {
		db = openDatabase({ path: ":memory:" });
		initializeSchema(db);

		const projectRoot = join(import.meta.dirname);
		const config: ProjectConfig = {
			modules: [
				{
					name: "api",
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

	// Helper to find a function by name
	function findFunction(name: string) {
		return queryNodes(db, name, { type: "Function" })[0];
	}

	// Helper to find functions in a specific layer
	function findFunctionsInLayer(layer: string) {
		return queryNodes(db, "*", { type: "Function" }).filter((n) =>
			n.filePath.includes(`${layer}/`),
		);
	}

	describe(queryPath.name, () => {
		it("finds path from handleGetUser to query through all layers", () => {
			const handleGetUser = findFunction("handleGetUser");
			const queryFn = findFunction("query");

			expect(handleGetUser).toBeDefined();
			expect(queryFn).toBeDefined();

			const result = queryPath(db, handleGetUser!.id, queryFn!.id);

			expect(result).not.toBeNull();
			// Path: handleGetUser → getUserById → findUserById → query (4 nodes)
			expect(result!.nodes.length).toBeGreaterThanOrEqual(4);
		});

		it("finds path from handleCreateOrder to query", () => {
			const handleCreateOrder = findFunction("handleCreateOrder");
			const queryFn = findFunction("query");

			expect(handleCreateOrder).toBeDefined();
			expect(queryFn).toBeDefined();

			const result = queryPath(db, handleCreateOrder!.id, queryFn!.id);

			expect(result).not.toBeNull();
			expect(result!.nodes.length).toBeGreaterThanOrEqual(4);
		});

		it("returns null for reverse path (query to controller)", () => {
			const handleGetUser = findFunction("handleGetUser");
			const queryFn = findFunction("query");

			expect(handleGetUser).toBeDefined();
			expect(queryFn).toBeDefined();

			// No path should exist from leaf back to controller
			const result = queryPath(db, queryFn!.id, handleGetUser!.id);
			expect(result).toBeNull();
		});
	});

	describe(queryCallees.name, () => {
		it("finds all downstream from handleGetUser (service → repo → db)", () => {
			const handleGetUser = findFunction("handleGetUser");
			expect(handleGetUser).toBeDefined();

			const result = queryCallees(db, handleGetUser!.id, 10);

			// Should find functions from all downstream layers
			const names = result.map((n) => n.name);
			expect(names).toContain("getUserById"); // service layer
			expect(names).toContain("findUserById"); // repo layer
			expect(names).toContain("query"); // db layer
		});

		it("finds only direct callees at depth 1", () => {
			const handleGetUser = findFunction("handleGetUser");
			expect(handleGetUser).toBeDefined();

			const result = queryCallees(db, handleGetUser!.id, 1);

			// At depth 1, should only see service layer function
			const names = result.map((n) => n.name);
			expect(names).toContain("getUserById");
			expect(names).not.toContain("findUserById"); // repo layer - depth 2
			expect(names).not.toContain("query"); // db layer - depth 3
		});

		it("finds transitive callees from getUserById", () => {
			const getUserById = findFunction("getUserById");
			expect(getUserById).toBeDefined();

			const result = queryCallees(db, getUserById!.id, 10);

			const names = result.map((n) => n.name);
			expect(names).toContain("findUserById");
			expect(names).toContain("query");
		});

		it("finds placeOrder callees including createOrder and getUserById", () => {
			const placeOrder = findFunction("placeOrder");
			expect(placeOrder).toBeDefined();

			const result = queryCallees(db, placeOrder!.id, 10);

			const names = result.map((n) => n.name);
			// placeOrder calls both createOrder (OrderRepo) and getUserById (UserService)
			expect(names).toContain("createOrder");
			expect(names).toContain("getUserById");
		});

		it("returns empty for leaf node (query has no callees)", () => {
			const queryFn = findFunction("query");
			expect(queryFn).toBeDefined();

			const result = queryCallees(db, queryFn!.id, 10);
			expect(result).toHaveLength(0);
		});
	});

	describe(queryCallers.name, () => {
		it("finds repository functions as callers of query", () => {
			const queryFn = findFunction("query");
			expect(queryFn).toBeDefined();

			const result = queryCallers(db, queryFn!.id, { maxDepth: 1 });

			// Both findUserById and findOrderById (and others) should call query
			const callerPaths = result.map((n) => n.filePath);
			expect(callerPaths.some((p) => p.includes("repositories/"))).toBe(true);
		});

		it("finds all upstream from query (repos → services → controllers)", () => {
			const queryFn = findFunction("query");
			expect(queryFn).toBeDefined();

			const result = queryCallers(db, queryFn!.id, { maxDepth: 10 });

			// Should find callers from all upstream layers
			const filePaths = result.map((n) => n.filePath);
			expect(filePaths.some((f) => f.includes("repositories/"))).toBe(true);
			expect(filePaths.some((f) => f.includes("services/"))).toBe(true);
			expect(filePaths.some((f) => f.includes("controllers/"))).toBe(true);
		});

		it("finds controller functions as direct callers of getUserById", () => {
			const getUserById = findFunction("getUserById");
			expect(getUserById).toBeDefined();

			const result = queryCallers(db, getUserById!.id, { maxDepth: 1 });

			const callerPaths = result.map((n) => n.filePath);
			expect(callerPaths.some((p) => p.includes("controllers/"))).toBe(true);
		});
	});

	describe("layer boundary verification", () => {
		it("controllers only call services (not repositories directly)", () => {
			const controllerEdges = queryEdges(db, {
				type: "CALLS",
			}).filter((e) => e.source.includes("controllers/"));

			const targetIds = controllerEdges.map((e) => e.target);
			const allNodes = queryNodes(db, "*");
			const targetNodes = allNodes.filter((n) => targetIds.includes(n.id));

			// All targets should be in services layer
			expect(targetNodes.length).toBeGreaterThan(0);
			expect(targetNodes.every((n) => n.filePath.includes("services/"))).toBe(
				true,
			);
		});

		it("services call repositories or other services (not database directly)", () => {
			const serviceEdges = queryEdges(db, {
				type: "CALLS",
			}).filter((e) => e.source.includes("services/"));

			const targetIds = serviceEdges.map((e) => e.target);
			const allNodes = queryNodes(db, "*");
			const targetNodes = allNodes.filter((n) => targetIds.includes(n.id));

			// All targets should be in services or repositories layer
			expect(targetNodes.length).toBeGreaterThan(0);
			expect(
				targetNodes.every(
					(n) =>
						n.filePath.includes("services/") ||
						n.filePath.includes("repositories/"),
				),
			).toBe(true);
		});

		it("repositories only call database or other repository functions (no service calls)", () => {
			const repoEdges = queryEdges(db, {
				type: "CALLS",
			}).filter((e) => e.source.includes("repositories/"));

			const targetIds = repoEdges.map((e) => e.target);
			const allNodes = queryNodes(db, "*");
			const targetNodes = allNodes.filter((n) => targetIds.includes(n.id));

			// All targets should be Database functions OR other repository functions (same-layer calls allowed)
			expect(targetNodes.length).toBeGreaterThan(0);
			expect(
				targetNodes.every(
					(n) =>
						n.filePath.includes("db/") || n.filePath.includes("repositories/"),
				),
			).toBe(true);
		});

		it("database has no outgoing CALLS edges (leaf node)", () => {
			const dbEdges = queryEdges(db, {
				type: "CALLS",
			}).filter((e) => e.source.includes("db/"));

			expect(dbEdges).toHaveLength(0);
		});
	});

	describe("cross-layer edge verification", () => {
		it("creates CALLS edges from controllers to services", () => {
			const edges = queryEdges(db, {
				type: "CALLS",
			}).filter(
				(e) =>
					e.source.includes("controllers/") && e.target.includes("services/"),
			);

			expect(edges.length).toBeGreaterThan(0);
		});

		it("creates CALLS edges from services to repositories", () => {
			const edges = queryEdges(db, {
				type: "CALLS",
			}).filter(
				(e) =>
					e.source.includes("services/") && e.target.includes("repositories/"),
			);

			expect(edges.length).toBeGreaterThan(0);
		});

		it("creates CALLS edges from repositories to database", () => {
			const edges = queryEdges(db, {
				type: "CALLS",
			}).filter(
				(e) => e.source.includes("repositories/") && e.target.includes("db/"),
			);

			expect(edges.length).toBeGreaterThan(0);
		});

		it("verifies complete call chain: controllers → services → repositories → database", () => {
			const allEdges = queryEdges(db, { type: "CALLS" });
			const allNodes = queryNodes(db, "*");
			const nodeMap = new Map(allNodes.map((n) => [n.id, n]));

			// Verify edges at each layer transition
			const layers = ["controllers", "services", "repositories", "db"];

			for (let i = 0; i < layers.length - 1; i++) {
				const fromLayer = layers[i];
				const toLayer = layers[i + 1];

				const layerEdges = allEdges.filter((e) => {
					const sourceNode = nodeMap.get(e.source);
					const targetNode = nodeMap.get(e.target);
					return (
						sourceNode?.filePath.includes(`${fromLayer}/`) &&
						targetNode?.filePath.includes(`${toLayer}/`)
					);
				});

				expect(
					layerEdges.length,
					`Should have CALLS edges from ${fromLayer} to ${toLayer}`,
				).toBeGreaterThan(0);
			}
		});
	});
});
