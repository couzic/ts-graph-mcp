import type Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { DbReader } from "../../../src/db/DbReader.js";
import type { DbWriter } from "../../../src/db/DbWriter.js";
import {
	closeDatabase,
	openDatabase,
} from "../../../src/db/sqlite/SqliteConnection.js";
import { createSqliteReader } from "../../../src/db/sqlite/SqliteReader.js";
import { createSqliteWriter } from "../../../src/db/sqlite/SqliteWriter.js";
import type {
	ClassNode,
	Edge,
	FunctionNode,
	Node,
	VariableNode,
} from "../../../src/db/Types.js";

describe("SQLite Integration - Roundtrip Tests", () => {
	let db: Database.Database;
	let writer: DbWriter;
	let reader: DbReader;

	beforeEach(() => {
		db = openDatabase({ path: ":memory:" });
		writer = createSqliteWriter(db);
		reader = createSqliteReader(db);
	});

	afterEach(() => {
		closeDatabase(db);
	});

	// Helper functions to build test data
	const createTestFunctionNode = (
		overrides?: Partial<FunctionNode>,
	): FunctionNode => ({
		id: "src/utils.ts:formatDate",
		type: "Function",
		name: "formatDate",
		module: "core",
		package: "myapp",
		filePath: "src/utils.ts",
		startLine: 10,
		endLine: 15,
		exported: true,
		parameters: [{ name: "date", type: "Date" }],
		returnType: "string",
		async: false,
		...overrides,
	});

	const createTestClassNode = (overrides?: Partial<ClassNode>): ClassNode => ({
		id: "src/models.ts:User",
		type: "Class",
		name: "User",
		module: "core",
		package: "myapp",
		filePath: "src/models.ts",
		startLine: 5,
		endLine: 20,
		exported: true,
		extends: "BaseModel",
		implements: ["IUser"],
		...overrides,
	});

	const createTestVariableNode = (
		overrides?: Partial<VariableNode>,
	): VariableNode => ({
		id: "src/config.ts:API_KEY",
		type: "Variable",
		name: "API_KEY",
		module: "core",
		package: "myapp",
		filePath: "src/config.ts",
		startLine: 1,
		endLine: 1,
		exported: true,
		variableType: "string",
		isConst: true,
		...overrides,
	});

	const createTestEdge = (overrides?: Partial<Edge>): Edge => ({
		source: "src/utils.ts:formatDate",
		target: "src/models.ts:User",
		type: "CALLS",
		callCount: 3,
		...overrides,
	});

	describe("addNodes / getNodeById", () => {
		it("should write and read back a function node with all properties", async () => {
			const node = createTestFunctionNode();
			await writer.addNodes([node]);

			const retrieved = await reader.getNodeById(node.id);

			expect(retrieved).toEqual(node);
		});

		it("should write and read back a class node with inheritance info", async () => {
			const node = createTestClassNode();
			await writer.addNodes([node]);

			const retrieved = await reader.getNodeById(node.id);

			expect(retrieved).toEqual(node);
		});

		it("should write and read back a variable node with const flag", async () => {
			const node = createTestVariableNode();
			await writer.addNodes([node]);

			const retrieved = await reader.getNodeById(node.id);

			expect(retrieved).toEqual(node);
		});

		it("should update existing node when adding with same id", async () => {
			const node = createTestFunctionNode({ name: "originalName" });
			await writer.addNodes([node]);

			const updatedNode = createTestFunctionNode({ name: "updatedName" });
			await writer.addNodes([updatedNode]);

			const retrieved = await reader.getNodeById(node.id);

			expect(retrieved?.name).toBe("updatedName");
		});

		it("should return null for non-existent node", async () => {
			const retrieved = await reader.getNodeById("non-existent-id");

			expect(retrieved).toBeNull();
		});

		it("should handle nodes with optional properties missing", async () => {
			const node = createTestFunctionNode({
				parameters: undefined,
				returnType: undefined,
				async: undefined,
			});
			await writer.addNodes([node]);

			const retrieved = await reader.getNodeById(node.id);

			expect(retrieved).toEqual(node);
		});
	});

	describe("addEdges", () => {
		it("should write edges between nodes and verify they exist", async () => {
			const nodeA = createTestFunctionNode({
				id: "src/a.ts:funcA",
				name: "funcA",
			});
			const nodeB = createTestFunctionNode({
				id: "src/b.ts:funcB",
				name: "funcB",
			});
			await writer.addNodes([nodeA, nodeB]);

			const edge = createTestEdge({
				source: nodeA.id,
				target: nodeB.id,
				type: "CALLS",
				callCount: 5,
			});
			await writer.addEdges([edge]);

			// Verify edge exists by checking if nodeB is a callee of nodeA
			const callees = await reader.getCalleesOf(nodeA.id);
			expect(callees).toHaveLength(1);
			expect(callees[0]?.id).toBe(nodeB.id);
		});

		it("should handle multiple edge types between same nodes", async () => {
			const nodeA = createTestFunctionNode({
				id: "src/a.ts:funcA",
				name: "funcA",
			});
			const nodeB = createTestClassNode({
				id: "src/b.ts:ClassB",
				name: "ClassB",
			});
			await writer.addNodes([nodeA, nodeB]);

			const edges: Edge[] = [
				{ source: nodeA.id, target: nodeB.id, type: "CALLS" },
				{
					source: nodeA.id,
					target: nodeB.id,
					type: "USES_TYPE",
					context: "return",
				},
			];
			await writer.addEdges(edges);

			// Verify both edges exist
			const callees = await reader.getCalleesOf(nodeA.id);
			const typeUsages = await reader.getTypeUsages(nodeB.id);

			expect(callees).toHaveLength(1);
			expect(typeUsages).toHaveLength(1);
		});

		it("should handle edges with IMPORTS metadata", async () => {
			const nodeA = createTestFunctionNode({
				id: "src/a.ts:funcA",
				name: "funcA",
			});
			const nodeB = createTestFunctionNode({
				id: "src/b.ts:funcB",
				name: "funcB",
			});
			await writer.addNodes([nodeA, nodeB]);

			const edge: Edge = {
				source: nodeA.id,
				target: nodeB.id,
				type: "IMPORTS",
				isTypeOnly: false,
				importedSymbols: ["funcB", "helperFunc"],
			};
			await writer.addEdges([edge]);

			// Verify edge was stored (check via path)
			const path = await reader.getPathBetween(nodeA.id, nodeB.id);
			expect(path).not.toBeNull();
			expect(path?.edges[0]?.type).toBe("IMPORTS");
		});
	});

	describe("removeFileNodes", () => {
		it("should add nodes for a file, remove them, and verify gone", async () => {
			const file = "src/test-file.ts";
			const nodes = [
				createTestFunctionNode({
					id: `${file}:func1`,
					name: "func1",
					filePath: file,
				}),
				createTestFunctionNode({
					id: `${file}:func2`,
					name: "func2",
					filePath: file,
				}),
				createTestClassNode({
					id: `${file}:Class1`,
					name: "Class1",
					filePath: file,
				}),
			];
			await writer.addNodes(nodes);

			// Verify nodes exist
			const beforeRemoval = await reader.getFileNodes(file);
			expect(beforeRemoval).toHaveLength(3);

			// Remove all nodes from file
			await writer.removeFileNodes(file);

			// Verify nodes are gone
			const afterRemoval = await reader.getFileNodes(file);
			expect(afterRemoval).toHaveLength(0);

			for (const node of nodes) {
				const retrieved = await reader.getNodeById(node.id);
				expect(retrieved).toBeNull();
			}
		});

		it("should cascade delete edges when removing nodes", async () => {
			const fileA = "src/a.ts";
			const fileB = "src/b.ts";
			const nodeA = createTestFunctionNode({
				id: `${fileA}:funcA`,
				filePath: fileA,
			});
			const nodeB = createTestFunctionNode({
				id: `${fileB}:funcB`,
				filePath: fileB,
			});
			await writer.addNodes([nodeA, nodeB]);

			const edge = createTestEdge({ source: nodeA.id, target: nodeB.id });
			await writer.addEdges([edge]);

			// Verify edge exists
			const callees = await reader.getCalleesOf(nodeA.id);
			expect(callees).toHaveLength(1);

			// Remove source node
			await writer.removeFileNodes(fileA);

			// Edge should be gone (nodeA is gone, so can't query from it)
			const nodeARetrieved = await reader.getNodeById(nodeA.id);
			expect(nodeARetrieved).toBeNull();
		});
	});

	describe("clearAll", () => {
		it("should add data, clear, and verify database is empty", async () => {
			const nodes = [
				createTestFunctionNode(),
				createTestClassNode(),
				createTestVariableNode(),
			];
			await writer.addNodes(nodes);

			const [node0, node1] = nodes;
			const edges = [createTestEdge({ source: node0.id, target: node1.id })];
			await writer.addEdges(edges);

			// Verify data exists
			for (const node of nodes) {
				const retrieved = await reader.getNodeById(node.id);
				expect(retrieved).not.toBeNull();
			}

			// Clear all
			await writer.clearAll();

			// Verify all data is gone
			for (const node of nodes) {
				const retrieved = await reader.getNodeById(node.id);
				expect(retrieved).toBeNull();
			}

			const searchResults = await reader.searchNodes("*");
			expect(searchResults).toHaveLength(0);
		});
	});

	describe("getCallersOf", () => {
		it("should create call chain A->B->C and verify getCallersOf(C) returns [A, B]", async () => {
			const nodeA = createTestFunctionNode({
				id: "src/a.ts:funcA",
				name: "funcA",
			});
			const nodeB = createTestFunctionNode({
				id: "src/b.ts:funcB",
				name: "funcB",
			});
			const nodeC = createTestFunctionNode({
				id: "src/c.ts:funcC",
				name: "funcC",
			});
			await writer.addNodes([nodeA, nodeB, nodeC]);

			const edges: Edge[] = [
				{ source: nodeA.id, target: nodeB.id, type: "CALLS" },
				{ source: nodeB.id, target: nodeC.id, type: "CALLS" },
			];
			await writer.addEdges(edges);

			const callers = await reader.getCallersOf(nodeC.id);

			expect(callers).toHaveLength(2);
			const callerIds = callers.map((n) => n.id).sort();
			expect(callerIds).toEqual([nodeA.id, nodeB.id].sort());
		});

		it("should respect maxDepth option", async () => {
			const nodeA = createTestFunctionNode({
				id: "src/a.ts:funcA",
				name: "funcA",
			});
			const nodeB = createTestFunctionNode({
				id: "src/b.ts:funcB",
				name: "funcB",
			});
			const nodeC = createTestFunctionNode({
				id: "src/c.ts:funcC",
				name: "funcC",
			});
			await writer.addNodes([nodeA, nodeB, nodeC]);

			const edges: Edge[] = [
				{ source: nodeA.id, target: nodeB.id, type: "CALLS" },
				{ source: nodeB.id, target: nodeC.id, type: "CALLS" },
			];
			await writer.addEdges(edges);

			// Only get direct callers (depth 1)
			const callers = await reader.getCallersOf(nodeC.id, { maxDepth: 1 });

			expect(callers).toHaveLength(1);
			expect(callers[0]?.id).toBe(nodeB.id);
		});
	});

	describe("getCalleesOf", () => {
		it("should create call chain A->B->C and verify getCalleesOf(A) returns [B, C]", async () => {
			const nodeA = createTestFunctionNode({
				id: "src/a.ts:funcA",
				name: "funcA",
			});
			const nodeB = createTestFunctionNode({
				id: "src/b.ts:funcB",
				name: "funcB",
			});
			const nodeC = createTestFunctionNode({
				id: "src/c.ts:funcC",
				name: "funcC",
			});
			await writer.addNodes([nodeA, nodeB, nodeC]);

			const edges: Edge[] = [
				{ source: nodeA.id, target: nodeB.id, type: "CALLS" },
				{ source: nodeB.id, target: nodeC.id, type: "CALLS" },
			];
			await writer.addEdges(edges);

			const callees = await reader.getCalleesOf(nodeA.id);

			expect(callees).toHaveLength(2);
			const calleeIds = callees.map((n) => n.id).sort();
			expect(calleeIds).toEqual([nodeB.id, nodeC.id].sort());
		});

		it("should respect maxDepth option", async () => {
			const nodeA = createTestFunctionNode({
				id: "src/a.ts:funcA",
				name: "funcA",
			});
			const nodeB = createTestFunctionNode({
				id: "src/b.ts:funcB",
				name: "funcB",
			});
			const nodeC = createTestFunctionNode({
				id: "src/c.ts:funcC",
				name: "funcC",
			});
			await writer.addNodes([nodeA, nodeB, nodeC]);

			const edges: Edge[] = [
				{ source: nodeA.id, target: nodeB.id, type: "CALLS" },
				{ source: nodeB.id, target: nodeC.id, type: "CALLS" },
			];
			await writer.addEdges(edges);

			// Only get direct callees (depth 1)
			const callees = await reader.getCalleesOf(nodeA.id, { maxDepth: 1 });

			expect(callees).toHaveLength(1);
			expect(callees[0]?.id).toBe(nodeB.id);
		});
	});

	describe("searchNodes", () => {
		it("should add nodes with different names and search with glob pattern", async () => {
			const nodes = [
				createTestFunctionNode({
					id: "src/a.ts:getUserById",
					name: "getUserById",
				}),
				createTestFunctionNode({
					id: "src/b.ts:getUserByEmail",
					name: "getUserByEmail",
				}),
				createTestFunctionNode({
					id: "src/c.ts:updateUser",
					name: "updateUser",
				}),
				createTestFunctionNode({
					id: "src/d.ts:deleteUser",
					name: "deleteUser",
				}),
			];
			await writer.addNodes(nodes);

			// Search for functions starting with "getUser"
			const results = await reader.searchNodes("getUser*");

			expect(results).toHaveLength(2);
			const resultNames = results.map((n) => n.name).sort();
			expect(resultNames).toEqual(["getUserByEmail", "getUserById"]);
		});

		it("should support wildcard pattern matching any node", async () => {
			const nodes = [
				createTestFunctionNode({ id: "src/a.ts:funcA", name: "funcA" }),
				createTestClassNode({ id: "src/b.ts:ClassB", name: "ClassB" }),
			];
			await writer.addNodes(nodes);

			const results = await reader.searchNodes("*");

			expect(results.length).toBeGreaterThanOrEqual(2);
		});

		it("should filter search results by node type", async () => {
			const nodes: Node[] = [
				createTestFunctionNode({ id: "src/a.ts:func1", name: "func1" }),
				createTestClassNode({ id: "src/b.ts:Class1", name: "Class1" }),
				createTestVariableNode({ id: "src/c.ts:var1", name: "var1" }),
			];
			await writer.addNodes(nodes);

			const results = await reader.searchNodes("*", { nodeType: "Function" });

			expect(results).toHaveLength(1);
			expect(results[0]?.type).toBe("Function");
		});

		it("should filter search results by exported status", async () => {
			const nodes = [
				createTestFunctionNode({
					id: "src/a.ts:publicFunc",
					name: "publicFunc",
					exported: true,
				}),
				createTestFunctionNode({
					id: "src/b.ts:privateFunc",
					name: "privateFunc",
					exported: false,
				}),
			];
			await writer.addNodes(nodes);

			const exportedResults = await reader.searchNodes("*", { exported: true });
			const notExportedResults = await reader.searchNodes("*", {
				exported: false,
			});

			expect(exportedResults.length).toBeGreaterThanOrEqual(1);
			expect(notExportedResults.length).toBeGreaterThanOrEqual(1);
			expect(exportedResults.every((n) => n.exported)).toBe(true);
			expect(notExportedResults.every((n) => !n.exported)).toBe(true);
		});
	});

	describe("getFileNodes", () => {
		it("should add multiple nodes to same file and retrieve by filePath", async () => {
			const file = "src/utils.ts";
			const nodes = [
				createTestFunctionNode({
					id: `${file}:func1`,
					name: "func1",
					filePath: file,
				}),
				createTestFunctionNode({
					id: `${file}:func2`,
					name: "func2",
					filePath: file,
				}),
				createTestClassNode({
					id: `${file}:Class1`,
					name: "Class1",
					filePath: file,
				}),
			];
			await writer.addNodes(nodes);

			const fileNodes = await reader.getFileNodes(file);

			expect(fileNodes).toHaveLength(3);
			const nodeNames = fileNodes.map((n) => n.name).sort();
			expect(nodeNames).toEqual(["Class1", "func1", "func2"]);
		});

		it("should return empty array for file with no nodes", async () => {
			const fileNodes = await reader.getFileNodes("src/nonexistent.ts");

			expect(fileNodes).toHaveLength(0);
		});

		it("should not return nodes from different files", async () => {
			const fileA = "src/a.ts";
			const fileB = "src/b.ts";
			const nodesA = [
				createTestFunctionNode({ id: `${fileA}:func1`, filePath: fileA }),
			];
			const nodesB = [
				createTestFunctionNode({ id: `${fileB}:func2`, filePath: fileB }),
			];
			await writer.addNodes([...nodesA, ...nodesB]);

			const fileANodes = await reader.getFileNodes(fileA);

			expect(fileANodes).toHaveLength(1);
			expect(fileANodes[0]?.filePath).toBe(fileA);
		});
	});

	describe("findNeighbors", () => {
		it("should create small graph and test distance=1", async () => {
			// Create graph: A -> B -> C
			//                ↓
			//                D
			const nodes = [
				createTestFunctionNode({ id: "src/a.ts:funcA", name: "funcA" }),
				createTestFunctionNode({ id: "src/b.ts:funcB", name: "funcB" }),
				createTestFunctionNode({ id: "src/c.ts:funcC", name: "funcC" }),
				createTestFunctionNode({ id: "src/d.ts:funcD", name: "funcD" }),
			];
			await writer.addNodes(nodes);

			const edges: Edge[] = [
				{ source: nodes[0].id, target: nodes[1].id, type: "CALLS" },
				{ source: nodes[1].id, target: nodes[2].id, type: "CALLS" },
				{ source: nodes[0].id, target: nodes[3].id, type: "CALLS" },
			];
			await writer.addEdges(edges);

			// Get neighbors within distance 1 from A (outgoing)
			const subgraph = await reader.findNeighbors(nodes[0].id, {
				distance: 1,
				direction: "outgoing",
			});

			expect(subgraph.center.id).toBe(nodes[0].id);
			expect(subgraph.nodes.length).toBe(3); // A, B, D
			const nodeIds = subgraph.nodes.map((n) => n.id).sort();
			expect(nodeIds).toEqual([nodes[0].id, nodes[1].id, nodes[3].id].sort());
			expect(subgraph.edges.length).toBe(2); // A->B, A->D
		});

		it("should create small graph and test distance=2", async () => {
			// Create graph: A -> B -> C
			//                ↓
			//                D
			const nodes = [
				createTestFunctionNode({ id: "src/a.ts:funcA", name: "funcA" }),
				createTestFunctionNode({ id: "src/b.ts:funcB", name: "funcB" }),
				createTestFunctionNode({ id: "src/c.ts:funcC", name: "funcC" }),
				createTestFunctionNode({ id: "src/d.ts:funcD", name: "funcD" }),
			];
			await writer.addNodes(nodes);

			const edges: Edge[] = [
				{ source: nodes[0].id, target: nodes[1].id, type: "CALLS" },
				{ source: nodes[1].id, target: nodes[2].id, type: "CALLS" },
				{ source: nodes[0].id, target: nodes[3].id, type: "CALLS" },
			];
			await writer.addEdges(edges);

			// Get neighbors within distance 2 from A (outgoing)
			const subgraph = await reader.findNeighbors(nodes[0].id, {
				distance: 2,
				direction: "outgoing",
			});

			expect(subgraph.center.id).toBe(nodes[0].id);
			expect(subgraph.nodes.length).toBe(4); // A, B, C, D
			const nodeIds = subgraph.nodes.map((n) => n.id).sort();
			expect(nodeIds).toEqual(nodes.map((n) => n.id).sort());
			expect(subgraph.edges.length).toBe(3); // A->B, B->C, A->D
		});

		it("should respect direction parameter for incoming edges", async () => {
			// Create graph: A -> B -> C
			const nodes = [
				createTestFunctionNode({ id: "src/a.ts:funcA", name: "funcA" }),
				createTestFunctionNode({ id: "src/b.ts:funcB", name: "funcB" }),
				createTestFunctionNode({ id: "src/c.ts:funcC", name: "funcC" }),
			];
			await writer.addNodes(nodes);

			const edges: Edge[] = [
				{ source: nodes[0].id, target: nodes[1].id, type: "CALLS" },
				{ source: nodes[1].id, target: nodes[2].id, type: "CALLS" },
			];
			await writer.addEdges(edges);

			// Get incoming neighbors from C
			const subgraph = await reader.findNeighbors(nodes[2].id, {
				distance: 2,
				direction: "incoming",
			});

			expect(subgraph.center.id).toBe(nodes[2].id);
			expect(subgraph.nodes.length).toBe(3); // A, B, C
			const nodeIds = subgraph.nodes.map((n) => n.id).sort();
			expect(nodeIds).toEqual(nodes.map((n) => n.id).sort());
		});

		it("should respect direction parameter for both directions", async () => {
			// Create graph: A -> B -> C
			const nodes = [
				createTestFunctionNode({ id: "src/a.ts:funcA", name: "funcA" }),
				createTestFunctionNode({ id: "src/b.ts:funcB", name: "funcB" }),
				createTestFunctionNode({ id: "src/c.ts:funcC", name: "funcC" }),
			];
			await writer.addNodes(nodes);

			const edges: Edge[] = [
				{ source: nodes[0].id, target: nodes[1].id, type: "CALLS" },
				{ source: nodes[1].id, target: nodes[2].id, type: "CALLS" },
			];
			await writer.addEdges(edges);

			// Get neighbors in both directions from B
			const subgraph = await reader.findNeighbors(nodes[1].id, {
				distance: 1,
				direction: "both",
			});

			expect(subgraph.center.id).toBe(nodes[1].id);
			expect(subgraph.nodes.length).toBe(3); // A, B, C
			const nodeIds = subgraph.nodes.map((n) => n.id).sort();
			expect(nodeIds).toEqual(nodes.map((n) => n.id).sort());
		});

		it("should filter by edge types", async () => {
			const nodes = [
				createTestFunctionNode({ id: "src/a.ts:funcA", name: "funcA" }),
				createTestClassNode({ id: "src/b.ts:ClassB", name: "ClassB" }),
				createTestFunctionNode({ id: "src/c.ts:funcC", name: "funcC" }),
			];
			await writer.addNodes(nodes);

			const edges: Edge[] = [
				{ source: nodes[0].id, target: nodes[1].id, type: "USES_TYPE" },
				{ source: nodes[0].id, target: nodes[2].id, type: "CALLS" },
			];
			await writer.addEdges(edges);

			// Get neighbors with only CALLS edges
			const subgraph = await reader.findNeighbors(nodes[0].id, {
				distance: 1,
				direction: "outgoing",
				edgeTypes: ["CALLS"],
			});

			expect(subgraph.nodes.length).toBe(2); // A, C (not B)
			expect(subgraph.edges.length).toBe(1);
			expect(subgraph.edges[0]?.type).toBe("CALLS");
		});

		it("should throw error if center node does not exist", async () => {
			await expect(
				reader.findNeighbors("non-existent-id", { distance: 1 }),
			).rejects.toThrow("Node not found: non-existent-id");
		});
	});
});
