import type Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	closeDatabase,
	openDatabase,
} from "../../db/sqlite/SqliteConnection.js";
import { initializeSchema } from "../../db/sqlite/SqliteSchema.js";
import { createSqliteWriter } from "../../db/sqlite/SqliteWriter.js";
import type { Edge, FunctionNode, InterfaceNode } from "../../db/Types.js";
import { queryImpactedNodes } from "./query.js";

// Test data factory - creates minimal function nodes
const fn = (
	name: string,
	file = "src/test.ts",
	module = "test",
): FunctionNode => ({
	id: `${file}:${name}`,
	type: "Function",
	name,
	module,
	package: "main",
	filePath: file,
	startLine: 1,
	endLine: 10,
	exported: true,
});

// Test data factory - creates minimal interface nodes
const iface = (
	name: string,
	file = "src/test.ts",
	module = "test",
): InterfaceNode => ({
	id: `${file}:${name}`,
	type: "Interface",
	name,
	module,
	package: "main",
	filePath: file,
	startLine: 1,
	endLine: 10,
	exported: true,
});

const calls = (from: string, to: string): Edge => ({
	source: from,
	target: to,
	type: "CALLS",
});

const usesType = (from: string, to: string): Edge => ({
	source: from,
	target: to,
	type: "USES_TYPE",
});

describe(queryImpactedNodes.name, () => {
	let db: Database.Database;

	beforeEach(() => {
		db = openDatabase({ path: ":memory:" });
		initializeSchema(db);
	});

	afterEach(() => {
		closeDatabase(db);
	});

	it("returns empty array for node with no dependents", async () => {
		const writer = createSqliteWriter(db);
		const nodeA = fn("a");
		await writer.addNodes([nodeA]);

		const result = queryImpactedNodes(db, nodeA.id);

		expect(result).toEqual([]);
	});

	it("returns direct dependents via CALLS", async () => {
		const writer = createSqliteWriter(db);
		const nodeA = fn("a");
		const nodeB = fn("b");
		await writer.addNodes([nodeA, nodeB]);
		await writer.addEdges([calls(nodeA.id, nodeB.id)]); // A calls B

		const result = queryImpactedNodes(db, nodeB.id); // Impact on B

		expect(result).toHaveLength(1);
		expect(result[0]?.id).toBe(nodeA.id);
	});

	it("returns dependents via USES_TYPE", async () => {
		const writer = createSqliteWriter(db);
		const nodeA = fn("a");
		const typeB = iface("B");
		await writer.addNodes([nodeA, typeB]);
		await writer.addEdges([usesType(nodeA.id, typeB.id)]); // A uses type B

		const result = queryImpactedNodes(db, typeB.id); // Impact on B

		expect(result).toHaveLength(1);
		expect(result[0]?.id).toBe(nodeA.id);
	});

	it("returns transitive impact", async () => {
		const writer = createSqliteWriter(db);
		const nodeA = fn("a");
		const nodeB = fn("b");
		const nodeC = fn("c");
		await writer.addNodes([nodeA, nodeB, nodeC]);
		await writer.addEdges([
			calls(nodeA.id, nodeB.id), // A → B
			calls(nodeB.id, nodeC.id), // B → C
		]);

		const result = queryImpactedNodes(db, nodeC.id); // Impact on C

		expect(result).toHaveLength(2);
		const ids = result.map((n) => n.id);
		expect(ids).toContain(nodeA.id);
		expect(ids).toContain(nodeB.id);
	});

	it("respects maxDepth=1 to return only direct dependents", async () => {
		const writer = createSqliteWriter(db);
		const nodeA = fn("a");
		const nodeB = fn("b");
		const nodeC = fn("c");
		await writer.addNodes([nodeA, nodeB, nodeC]);
		await writer.addEdges([
			calls(nodeA.id, nodeB.id), // A → B
			calls(nodeB.id, nodeC.id), // B → C
		]);

		const result = queryImpactedNodes(db, nodeC.id, { maxDepth: 1 });

		expect(result).toHaveLength(1);
		expect(result[0]?.id).toBe(nodeB.id);
	});

	it("handles multiple edge types", async () => {
		const writer = createSqliteWriter(db);
		const nodeA = fn("a");
		const nodeB = fn("b");
		const typeC = iface("C");
		await writer.addNodes([nodeA, nodeB, typeC]);
		await writer.addEdges([
			calls(nodeA.id, typeC.id), // A calls C
			usesType(nodeB.id, typeC.id), // B uses type C
		]);

		const result = queryImpactedNodes(db, typeC.id); // Impact on C

		expect(result).toHaveLength(2);
		const ids = result.map((n) => n.id);
		expect(ids).toContain(nodeA.id);
		expect(ids).toContain(nodeB.id);
	});

	it("handles cycles without infinite loop", async () => {
		const writer = createSqliteWriter(db);
		const nodeA = fn("a");
		const nodeB = fn("b");
		await writer.addNodes([nodeA, nodeB]);
		await writer.addEdges([
			calls(nodeA.id, nodeB.id), // A → B
			calls(nodeB.id, nodeA.id), // B → A (cycle)
		]);

		// Should complete without hanging
		const result = queryImpactedNodes(db, nodeA.id);

		expect(result).toHaveLength(2);
		const ids = result.map((n) => n.id);
		expect(ids).toContain(nodeA.id); // A is a transitive dependent of itself
		expect(ids).toContain(nodeB.id);
	});

	it("returns impacted nodes from multiple files", async () => {
		const writer = createSqliteWriter(db);
		const nodeA = fn("a", "src/fileA.ts");
		const nodeB = fn("b", "src/fileB.ts");
		const nodeC = fn("c", "src/fileC.ts");
		await writer.addNodes([nodeA, nodeB, nodeC]);
		await writer.addEdges([
			calls(nodeA.id, nodeC.id),
			calls(nodeB.id, nodeC.id),
		]);

		const result = queryImpactedNodes(db, nodeC.id);

		expect(result).toHaveLength(2);
		const ids = result.map((n) => n.id);
		expect(ids).toContain(nodeA.id);
		expect(ids).toContain(nodeB.id);
	});

	it("handles deep transitive dependencies", async () => {
		const writer = createSqliteWriter(db);
		const nodeA = fn("a");
		const nodeB = fn("b");
		const nodeC = fn("c");
		const nodeD = fn("d");
		await writer.addNodes([nodeA, nodeB, nodeC, nodeD]);
		await writer.addEdges([
			calls(nodeA.id, nodeB.id), // A → B
			calls(nodeB.id, nodeC.id), // B → C
			calls(nodeC.id, nodeD.id), // C → D
		]);

		const result = queryImpactedNodes(db, nodeD.id);

		expect(result).toHaveLength(3);
		const ids = result.map((n) => n.id);
		expect(ids).toContain(nodeA.id);
		expect(ids).toContain(nodeB.id);
		expect(ids).toContain(nodeC.id);
	});

	it("handles diamond dependency pattern", async () => {
		const writer = createSqliteWriter(db);
		const nodeA = fn("a");
		const nodeB = fn("b");
		const nodeC = fn("c");
		const nodeD = fn("d");
		await writer.addNodes([nodeA, nodeB, nodeC, nodeD]);
		await writer.addEdges([
			calls(nodeA.id, nodeB.id), // A → B
			calls(nodeA.id, nodeC.id), // A → C
			calls(nodeB.id, nodeD.id), // B → D
			calls(nodeC.id, nodeD.id), // C → D
		]);

		const result = queryImpactedNodes(db, nodeD.id);

		// A, B, C all depend on D
		expect(result).toHaveLength(3);
		const ids = result.map((n) => n.id);
		expect(ids).toContain(nodeA.id);
		expect(ids).toContain(nodeB.id);
		expect(ids).toContain(nodeC.id);
	});
});
