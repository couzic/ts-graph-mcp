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
import { queryNodes } from "../../src/db/queryNodes.js";
import { queryEdges } from "../../src/db/queryEdges.js";

// Helper to get all nodes in a file (replacement for deprecated queryFileNodes)
function queryFileNodes(db: Database.Database, filePath: string) {
	return queryNodes(db, "*").filter((n) => n.filePath === filePath);
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

	describe(queryNodes.name, () => {
		it('finds User interface and UserService class with pattern "User*"', () => {
			const result = queryNodes(db, "User*");

			const names = result.map((n) => n.name);
			expect(names).toContain("User");
			expect(names).toContain("UserService");
		});

		it("filters by nodeType Interface to return only User", () => {
			const result = queryNodes(db, "User*", { type: "Interface" });

			expect(result).toHaveLength(1);
			expect(result[0]?.name).toBe("User");
			expect(result[0]?.type).toBe("Interface");
		});

		it("finds TypeAlias UserId", () => {
			const result = queryNodes(db, "UserId");

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

	describe("Property nodes from interfaces", () => {
		it("extracts properties from interfaces and classes", () => {
			const result = queryNodes(db, "*", { type: "Property" });

			const names = result.map((n) => n.name);
			// User interface properties
			expect(names).toContain("id");
			expect(names).toContain("name");
			// UserService class property
			expect(names).toContain("users");
			// Entity interface property
			expect(names).toContain("id");
			// Auditable interface properties
			expect(names).toContain("createdAt");
			expect(names).toContain("updatedAt");
			// BaseService, AdminService, AuditLog properties
			expect(names.length).toBeGreaterThanOrEqual(3);
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
			const result = queryNodes(db, "fetchData");

			expect(result).toHaveLength(1);
			const fetchDataNode = result[0];

			if (fetchDataNode?.type === "Function") {
				expect(fetchDataNode.async).toBe(true);
				expect(fetchDataNode.returnType).toBe("Promise<string>");
			}
		});

		it("verifies processData async function without explicit return type", () => {
			const result = queryNodes(db, "processData");

			expect(result).toHaveLength(1);
			const processDataNode = result[0];

			if (processDataNode?.type === "Function") {
				expect(processDataNode.async).toBe(true);
			}
		});

		it("verifies function parameters are extracted", () => {
			const result = queryNodes(db, "greet");

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
			const result = queryNodes(db, "addUser");

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
			const result = queryNodes(db, "users");

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
			const result = queryNodes(db, "DEFAULT_NAME");

			expect(result).toHaveLength(1);
			const variableNode = result[0];

			if (variableNode?.type === "Variable") {
				expect(variableNode.isConst).toBe(true);
				// No explicit type annotation, so variableType is undefined
				expect(variableNode.variableType).toBeUndefined();
			}
		});

		it("verifies MAX_RETRIES is const with explicit number type", () => {
			const result = queryNodes(db, "MAX_RETRIES");

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
			const result = queryNodes(db, "*.ts", { type: "File" });

			const fileNames = result.map((n) => n.name).sort();
			expect(fileNames).toContain("models.ts");
			expect(fileNames).toContain("types.ts");
			expect(fileNames).toContain("utils.ts");
		});
	});

	describe("Exported flag", () => {
		it("marks all top-level symbols as exported", () => {
			const allNodes = queryNodes(db, "*");
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

	describe("EXTENDS edges", () => {
		it("creates EXTENDS edge from UserService to BaseService", () => {
			const edges = queryEdges(db, {
				sourceId: "src/models.ts:UserService",
				targetId: "src/models.ts:BaseService",
				type: "EXTENDS",
			});

			expect(edges).toHaveLength(1);
			expect(edges[0]).toMatchObject({
				source: "src/models.ts:UserService",
				target: "src/models.ts:BaseService",
				type: "EXTENDS",
			});
		});

		it("creates EXTENDS edge from AdminService to UserService (3-level hierarchy)", () => {
			const edges = queryEdges(db, {
				sourceId: "src/models.ts:AdminService",
				targetId: "src/models.ts:UserService",
				type: "EXTENDS",
			});

			expect(edges).toHaveLength(1);
			expect(edges[0]).toMatchObject({
				source: "src/models.ts:AdminService",
				target: "src/models.ts:UserService",
				type: "EXTENDS",
			});
		});

		it("creates EXTENDS edge from Auditable to Entity interface", () => {
			const edges = queryEdges(db, {
				sourceId: "src/types.ts:Auditable",
				targetId: "src/types.ts:Entity",
				type: "EXTENDS",
			});

			expect(edges).toHaveLength(1);
			expect(edges[0]).toMatchObject({
				source: "src/types.ts:Auditable",
				target: "src/types.ts:Entity",
				type: "EXTENDS",
			});
		});
	});

	describe("IMPLEMENTS edges", () => {
		it("creates IMPLEMENTS edge from AuditLog to Auditable interface", () => {
			const edges = queryEdges(db, {
				sourceId: "src/models.ts:AuditLog",
				targetId: "src/types.ts:Auditable",
				type: "IMPLEMENTS",
			});

			expect(edges).toHaveLength(1);
			expect(edges[0]).toMatchObject({
				source: "src/models.ts:AuditLog",
				target: "src/types.ts:Auditable",
				type: "IMPLEMENTS",
			});
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

		it("analyzeImpact shows models.ts symbols when querying User interface", () => {
			const result = queryImpactedNodes(db, "src/types.ts:User");

			const impactedIds = result.map((n) => n.id);
			expect(impactedIds).toContain("src/models.ts:UserService.addUser");
			expect(impactedIds).toContain("src/models.ts:UserService.users");
		});
	});

	describe("incomingUsesType tool integration", () => {
		it("finds all usages of User interface", () => {
			const edges = queryEdges(db, {
				targetId: "src/types.ts:User",
				type: "USES_TYPE",
			});

			expect(edges.length).toBeGreaterThan(0);
			const sourceIds = edges.map((e) => e.source);
			expect(sourceIds).toContain("src/models.ts:UserService.addUser");
			expect(sourceIds).toContain("src/models.ts:UserService.users");
		});

		it("filters by context parameter", () => {
			const edges = queryEdges(db, {
				targetId: "src/types.ts:User",
				type: "USES_TYPE",
				context: "parameter",
			});

			expect(edges.length).toBeGreaterThan(0);
			// All edges should have parameter context
			for (const edge of edges) {
				expect(edge.context).toBe("parameter");
			}
			// Should include the method parameter usage
			const sourceIds = edges.map((e) => e.source);
			expect(sourceIds).toContain("src/models.ts:UserService.addUser");
		});

		it("filters by context property", () => {
			const edges = queryEdges(db, {
				targetId: "src/types.ts:User",
				type: "USES_TYPE",
				context: "property",
			});

			expect(edges.length).toBeGreaterThan(0);
			// All edges should have property context
			for (const edge of edges) {
				expect(edge.context).toBe("property");
			}
			// Should include the property usage
			const sourceIds = edges.map((e) => e.source);
			expect(sourceIds).toContain("src/models.ts:UserService.users");
		});
	});
});
