import type Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createSqliteWriter } from "../../db/sqlite/createSqliteWriter.js";
import {
	closeDatabase,
	openDatabase,
} from "../../db/sqlite/sqliteConnection.utils.js";
import { initializeSchema } from "../../db/sqlite/sqliteSchema.utils.js";
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

const imports = (from: string, to: string): Edge => ({
	source: from,
	target: to,
	type: "IMPORTS",
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

	it("returns direct dependents via CALLS with depth=1", async () => {
		const writer = createSqliteWriter(db);
		const nodeA = fn("a");
		const nodeB = fn("b");
		await writer.addNodes([nodeA, nodeB]);
		await writer.addEdges([calls(nodeA.id, nodeB.id)]); // A calls B

		const result = queryImpactedNodes(db, nodeB.id); // Impact on B

		expect(result).toHaveLength(1);
		expect(result[0]?.id).toBe(nodeA.id);
		expect(result[0]?.depth).toBe(1);
		expect(result[0]?.entryEdgeType).toBe("CALLS");
	});

	it("returns dependents via USES_TYPE with correct edge type", async () => {
		const writer = createSqliteWriter(db);
		const nodeA = fn("a");
		const typeB = iface("B");
		await writer.addNodes([nodeA, typeB]);
		await writer.addEdges([usesType(nodeA.id, typeB.id)]); // A uses type B

		const result = queryImpactedNodes(db, typeB.id); // Impact on B

		expect(result).toHaveLength(1);
		expect(result[0]?.id).toBe(nodeA.id);
		expect(result[0]?.depth).toBe(1);
		expect(result[0]?.entryEdgeType).toBe("USES_TYPE");
	});

	it("returns transitive impact with correct depths", async () => {
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

		const nodeAResult = result.find((n) => n.id === nodeA.id);
		const nodeBResult = result.find((n) => n.id === nodeB.id);

		expect(nodeBResult?.depth).toBe(1); // B directly calls C
		expect(nodeAResult?.depth).toBe(2); // A transitively depends on C
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
		expect(result[0]?.depth).toBe(1);
	});

	it("handles multiple edge types and tracks entry edge type", async () => {
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

		const nodeAResult = result.find((n) => n.id === nodeA.id);
		const nodeBResult = result.find((n) => n.id === nodeB.id);

		expect(nodeAResult?.entryEdgeType).toBe("CALLS");
		expect(nodeBResult?.entryEdgeType).toBe("USES_TYPE");
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
		// Both should be depth 1 (direct callers)
		expect(result.every((n) => n.depth === 1)).toBe(true);
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

		const nodeAResult = result.find((n) => n.id === nodeA.id);
		const nodeBResult = result.find((n) => n.id === nodeB.id);
		const nodeCResult = result.find((n) => n.id === nodeC.id);

		expect(nodeCResult?.depth).toBe(1); // C directly calls D
		expect(nodeBResult?.depth).toBe(2); // B → C → D
		expect(nodeAResult?.depth).toBe(3); // A → B → C → D
	});

	it("handles diamond dependency pattern with minimum depth", async () => {
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

		const nodeAResult = result.find((n) => n.id === nodeA.id);
		const nodeBResult = result.find((n) => n.id === nodeB.id);
		const nodeCResult = result.find((n) => n.id === nodeC.id);

		// B and C are direct callers (depth 1)
		expect(nodeBResult?.depth).toBe(1);
		expect(nodeCResult?.depth).toBe(1);

		// A is transitive (depth 2, via either B or C)
		expect(nodeAResult?.depth).toBe(2);
	});

	it("returns results ordered by depth then file path", async () => {
		const writer = createSqliteWriter(db);
		const nodeA = fn("a", "src/z.ts"); // alphabetically last
		const nodeB = fn("b", "src/a.ts"); // alphabetically first
		const nodeC = fn("c", "src/m.ts");
		await writer.addNodes([nodeA, nodeB, nodeC]);
		await writer.addEdges([
			calls(nodeA.id, nodeC.id), // depth 1
			calls(nodeB.id, nodeA.id), // depth 2 (via A)
		]);

		const result = queryImpactedNodes(db, nodeC.id);

		expect(result).toHaveLength(2);
		// Should be ordered: depth 1 first (A), then depth 2 (B)
		expect(result[0]?.id).toBe(nodeA.id);
		expect(result[1]?.id).toBe(nodeB.id);
	});

	it("tracks entry edge type for mixed relationship chains", async () => {
		const writer = createSqliteWriter(db);
		const nodeA = fn("a");
		const nodeB = fn("b");
		const typeC = iface("C");
		await writer.addNodes([nodeA, nodeB, typeC]);
		await writer.addEdges([
			calls(nodeA.id, nodeB.id), // A calls B
			usesType(nodeB.id, typeC.id), // B uses type C
		]);

		const result = queryImpactedNodes(db, typeC.id);

		expect(result).toHaveLength(2);

		// B directly uses type C
		const nodeBResult = result.find((n) => n.id === nodeB.id);
		expect(nodeBResult?.depth).toBe(1);
		expect(nodeBResult?.entryEdgeType).toBe("USES_TYPE");

		// A transitively depends via CALLS edge to B
		const nodeAResult = result.find((n) => n.id === nodeA.id);
		expect(nodeAResult?.depth).toBe(2);
		expect(nodeAResult?.entryEdgeType).toBe("CALLS"); // The edge that connected A
	});

	it("tracks IMPORTS edge type", async () => {
		const writer = createSqliteWriter(db);
		const fileA = fn("a", "src/a.ts");
		const fileB = fn("b", "src/b.ts");
		await writer.addNodes([fileA, fileB]);
		await writer.addEdges([imports(fileA.id, fileB.id)]); // A imports B

		const result = queryImpactedNodes(db, fileB.id);

		expect(result).toHaveLength(1);
		expect(result[0]?.entryEdgeType).toBe("IMPORTS");
	});
});
