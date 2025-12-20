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
import { queryImpactedNodes } from "../../src/tools/analyze-impact/query.js";
import { queryNeighbors } from "../../src/tools/get-neighborhood/query.js";
import { querySearchNodes } from "../../src/tools/search-symbols/query.js";
import { queryEdges } from "../../src/db/queryEdges.js";

// Helper to get all nodes in a file (replacement for deprecated queryFileNodes)
function queryFileNodes(db: Database.Database, filePath: string) {
	return querySearchNodes(db, "*").filter((n) => n.filePath === filePath);
}

/**
 * Integration tests for mixed-types test project.
 * Tests: Interface, TypeAlias, Class, Method, Property, Variable, Function
 */
describe("mixed-types integration", () => {
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

	describe(querySearchNodes.name, () => {
		it('finds User interface and UserService class with pattern "User*"', () => {
			const result = querySearchNodes(db, "User*");

			const names = result.map((n) => n.name);
			expect(names).toContain("User");
			expect(names).toContain("UserService");
		});

		it("filters by nodeType Interface to return only User", () => {
			const result = querySearchNodes(db, "User*", { type: "Interface" });

			expect(result).toHaveLength(1);
			expect(result[0]?.name).toBe("User");
			expect(result[0]?.type).toBe("Interface");
		});

		it("finds TypeAlias UserId", () => {
			const result = querySearchNodes(db, "UserId");

			expect(result).toHaveLength(1);
			expect(result[0]?.name).toBe("UserId");
			expect(result[0]?.type).toBe("TypeAlias");
		});
	});

	describe(queryFileNodes.name, () => {
		it("returns UserService, users, and addUser for models.ts", () => {
			const result = queryFileNodes(db, "src/models.ts");

			const names = result.map((n) => n.name).sort();
			expect(names).toContain("UserService");
			expect(names).toContain("users");
			expect(names).toContain("addUser");

			const types = result.map((n) => n.type);
			expect(types).toContain("Class");
			expect(types).toContain("Property");
			expect(types).toContain("Method");
		});

		it("returns User and UserId for types.ts", () => {
			const result = queryFileNodes(db, "src/types.ts");

			const names = result.map((n) => n.name).sort();
			expect(names).toContain("User");
			expect(names).toContain("UserId");

			const types = result.map((n) => n.type);
			expect(types).toContain("Interface");
			expect(types).toContain("TypeAlias");
		});

		it("returns functions and const variables for utils.ts", () => {
			const result = queryFileNodes(db, "src/utils.ts");

			const names = result.map((n) => n.name).sort();
			expect(names).toContain("DEFAULT_NAME");
			expect(names).toContain("MAX_RETRIES");
			expect(names).toContain("greet");
			expect(names).toContain("fetchData");

			const types = result.map((n) => n.type);
			expect(types).toContain("Variable");
			expect(types).toContain("Function");
		});
	});

	describe(queryNeighbors.name, () => {
		it("finds File node as neighbor of UserService via CONTAINS edge", () => {
			const result = queryNeighbors(db, "src/models.ts:UserService", 1, "both");

			expect(result.center.id).toBe("src/models.ts:UserService");

			const neighborNames = result.nodes.map((n) => n.name);
			expect(neighborNames).toContain("models.ts");

			const containsEdge = result.edges.find((e) => e.type === "CONTAINS");
			expect(containsEdge).toBeDefined();
		});
	});

	describe("Property nodes from interfaces", () => {
		it("extracts id and name properties from User interface and users from UserService", () => {
			const result = querySearchNodes(db, "*", { type: "Property" });

			const names = result.map((n) => n.name);
			expect(names).toContain("id");
			expect(names).toContain("name");
			expect(names).toContain("users");
			expect(names).toHaveLength(3);
		});

		it("verifies User interface properties have correct types", () => {
			const result = queryFileNodes(db, "src/types.ts");

			const idProp = result.find(
				(n) => n.name === "id" && n.type === "Property",
			);
			const nameProp = result.find(
				(n) => n.name === "name" && n.type === "Property",
			);

			expect(idProp).toBeDefined();
			expect(nameProp).toBeDefined();

			if (idProp?.type === "Property") {
				expect(idProp.propertyType).toBe("number");
			}
			if (nameProp?.type === "Property") {
				expect(nameProp.propertyType).toBe("string");
			}
		});
	});

	describe("Function variations", () => {
		it("extracts all function variations from utils.ts", () => {
			const result = queryFileNodes(db, "src/utils.ts");

			const functionNodes = result.filter((n) => n.type === "Function");
			const functionNames = functionNodes.map((n) => n.name).sort();

			expect(functionNames).toEqual([
				"fetchData",
				"greet",
				"logMessage",
				"processData",
			]);
		});

		it("verifies async functions have async flag set", () => {
			const result = querySearchNodes(db, "fetchData");

			expect(result).toHaveLength(1);
			const fetchDataNode = result[0];

			if (fetchDataNode?.type === "Function") {
				expect(fetchDataNode.async).toBe(true);
				expect(fetchDataNode.returnType).toBe("Promise<string>");
			}
		});

		it("verifies processData async function without explicit return type", () => {
			const result = querySearchNodes(db, "processData");

			expect(result).toHaveLength(1);
			const processDataNode = result[0];

			if (processDataNode?.type === "Function") {
				expect(processDataNode.async).toBe(true);
			}
		});

		it("verifies function parameters are extracted", () => {
			const result = querySearchNodes(db, "greet");

			expect(result).toHaveLength(1);
			const greetNode = result[0];

			if (greetNode?.type === "Function") {
				expect(greetNode.parameters).toHaveLength(1);
				expect(greetNode.parameters[0]).toEqual({
					name: "name",
					type: "string",
				});
				expect(greetNode.returnType).toBe("string");
			}
		});
	});

	describe("Method node details", () => {
		it("verifies addUser method has parameters and return type", () => {
			const result = querySearchNodes(db, "addUser");

			expect(result).toHaveLength(1);
			const methodNode = result[0];

			if (methodNode?.type === "Method") {
				expect(methodNode.parameters).toHaveLength(1);
				expect(methodNode.parameters[0]).toEqual({
					name: "user",
					type: "User",
				});
				expect(methodNode.returnType).toBe("void");
			}
		});
	});

	describe("Property node details", () => {
		it("verifies users property is readonly", () => {
			const result = querySearchNodes(db, "users");

			expect(result).toHaveLength(1);
			const propertyNode = result[0];

			if (propertyNode?.type === "Property") {
				expect(propertyNode.readonly).toBe(true);
				expect(propertyNode.propertyType).toBe("User[]");
			}
		});
	});

	describe("Variable node details", () => {
		it("verifies DEFAULT_NAME is const without explicit type annotation", () => {
			const result = querySearchNodes(db, "DEFAULT_NAME");

			expect(result).toHaveLength(1);
			const variableNode = result[0];

			if (variableNode?.type === "Variable") {
				expect(variableNode.isConst).toBe(true);
				// No explicit type annotation, so variableType is undefined
				expect(variableNode.variableType).toBeUndefined();
			}
		});

		it("verifies MAX_RETRIES is const with explicit number type", () => {
			const result = querySearchNodes(db, "MAX_RETRIES");

			expect(result).toHaveLength(1);
			const variableNode = result[0];

			if (variableNode?.type === "Variable") {
				expect(variableNode.isConst).toBe(true);
				expect(variableNode.variableType).toBe("number");
			}
		});
	});

	describe("File nodes", () => {
		it("extracts File nodes for all source files", () => {
			const result = querySearchNodes(db, "*.ts", { type: "File" });

			const fileNames = result.map((n) => n.name).sort();
			expect(fileNames).toContain("models.ts");
			expect(fileNames).toContain("types.ts");
			expect(fileNames).toContain("utils.ts");
		});
	});

	describe("Exported flag", () => {
		it("marks all top-level symbols as exported", () => {
			const allNodes = querySearchNodes(db, "*");
			const topLevelNodes = allNodes.filter(
				(n) =>
					n.type !== "File" &&
					n.type !== "Property" &&
					!n.id.includes(":") &&
					!n.id.includes("."),
			);

			// All top-level symbols (except File and Property) should be exported
			for (const node of topLevelNodes) {
				expect(node.exported).toBe(true);
			}
		});
	});

	describe("Cross-file USES_TYPE edges (Issue #11)", () => {
		it("creates USES_TYPE edge from addUser method to User interface across files", () => {
			const edges = queryEdges(db, {
				sourceId: "src/models.ts:UserService.addUser",
				targetId: "src/types.ts:User",
				type: "USES_TYPE",
			});
			const edge = edges[0];

			expect(edge).toBeDefined();
			expect(edge).toMatchObject({
				source: "src/models.ts:UserService.addUser",
				target: "src/types.ts:User",
				type: "USES_TYPE",
				context: "parameter",
			});
		});

		it("creates USES_TYPE edge from users property to User interface across files", () => {
			const edges = queryEdges(db, {
				sourceId: "src/models.ts:UserService.users",
				targetId: "src/types.ts:User",
				type: "USES_TYPE",
			});
			const edge = edges[0];

			expect(edge).toBeDefined();
			expect(edge).toMatchObject({
				source: "src/models.ts:UserService.users",
				target: "src/types.ts:User",
				type: "USES_TYPE",
				context: "property",
			});
		});

		it("getNeighborhood shows User interface when querying addUser method", () => {
			const result = queryNeighbors(
				db,
				"src/models.ts:UserService.addUser",
				1,
				"outgoing",
			);

			const neighborIds = result.nodes.map((n) => n.id);
			expect(neighborIds).toContain("src/types.ts:User");

			const usesTypeEdge = result.edges.find(
				(e) =>
					e.type === "USES_TYPE" && e.target === "src/types.ts:User",
			);
			expect(usesTypeEdge).toBeDefined();
		});

		it("analyzeImpact shows models.ts symbols when querying User interface", () => {
			const result = queryImpactedNodes(db, "src/types.ts:User");

			const impactedIds = result.map((n) => n.id);
			expect(impactedIds).toContain("src/models.ts:UserService.addUser");
			expect(impactedIds).toContain("src/models.ts:UserService.users");
		});
	});
});
