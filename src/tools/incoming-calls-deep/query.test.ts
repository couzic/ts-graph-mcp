import type Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	closeDatabase,
	openDatabase,
} from "../../db/sqlite/SqliteConnection.js";
import { initializeSchema } from "../../db/sqlite/SqliteSchema.js";
import { createSqliteWriter } from "../../db/sqlite/SqliteWriter.js";
import type { Edge, FunctionNode } from "../../db/Types.js";
import { queryCallers } from "./query.js";

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

const calls = (from: string, to: string): Edge => ({
	source: from,
	target: to,
	type: "CALLS",
});

describe(queryCallers.name, () => {
	let db: Database.Database;

	beforeEach(() => {
		db = openDatabase({ path: ":memory:" });
		initializeSchema(db);
	});

	afterEach(() => {
		closeDatabase(db);
	});

	it("returns empty array when node has no callers", async () => {
		const writer = createSqliteWriter(db);
		const nodeB = fn("b");
		await writer.addNodes([nodeB]);

		const result = queryCallers(db, nodeB.id);

		expect(result).toEqual([]);
	});

	it("returns direct callers", async () => {
		const writer = createSqliteWriter(db);
		const nodeA = fn("a");
		const nodeB = fn("b");
		await writer.addNodes([nodeA, nodeB]);
		await writer.addEdges([calls(nodeA.id, nodeB.id)]);

		const result = queryCallers(db, nodeB.id);

		expect(result).toHaveLength(1);
		expect(result[0]?.id).toBe(nodeA.id);
	});

	it("returns transitive callers", async () => {
		const writer = createSqliteWriter(db);
		const nodeA = fn("a");
		const nodeB = fn("b");
		const nodeC = fn("c");
		await writer.addNodes([nodeA, nodeB, nodeC]);
		await writer.addEdges([
			calls(nodeA.id, nodeB.id), // A → B
			calls(nodeB.id, nodeC.id), // B → C
		]);

		const result = queryCallers(db, nodeC.id);

		expect(result).toHaveLength(2);
		const ids = result.map((n) => n.id);
		expect(ids).toContain(nodeA.id);
		expect(ids).toContain(nodeB.id);
	});

	it("respects maxDepth=1 to return only direct callers", async () => {
		const writer = createSqliteWriter(db);
		const nodeA = fn("a");
		const nodeB = fn("b");
		const nodeC = fn("c");
		await writer.addNodes([nodeA, nodeB, nodeC]);
		await writer.addEdges([
			calls(nodeA.id, nodeB.id), // A → B
			calls(nodeB.id, nodeC.id), // B → C
		]);

		const result = queryCallers(db, nodeC.id, { maxDepth: 1 });

		expect(result).toHaveLength(1);
		expect(result[0]?.id).toBe(nodeB.id);
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
		// With cycle A↔B, callers of B = [A (direct), B (transitive via A)]
		const result = queryCallers(db, nodeB.id);

		expect(result).toHaveLength(2);
		const ids = result.map((n) => n.id);
		expect(ids).toContain(nodeA.id);
		expect(ids).toContain(nodeB.id); // B is a transitive caller of itself
	});

	it("returns callers from multiple files", async () => {
		const writer = createSqliteWriter(db);
		const nodeA = fn("a", "src/fileA.ts");
		const nodeB = fn("b", "src/fileB.ts");
		const nodeC = fn("c", "src/fileC.ts");
		await writer.addNodes([nodeA, nodeB, nodeC]);
		await writer.addEdges([
			calls(nodeA.id, nodeC.id),
			calls(nodeB.id, nodeC.id),
		]);

		const result = queryCallers(db, nodeC.id);

		expect(result).toHaveLength(2);
		const ids = result.map((n) => n.id);
		expect(ids).toContain(nodeA.id);
		expect(ids).toContain(nodeB.id);
	});

	it("ignores non-CALLS edges", async () => {
		const writer = createSqliteWriter(db);
		const nodeA = fn("a");
		const nodeB = fn("b");
		await writer.addNodes([nodeA, nodeB]);
		await writer.addEdges([
			{ source: nodeA.id, target: nodeB.id, type: "USES_TYPE" }, // Not a CALLS edge
		]);

		const result = queryCallers(db, nodeB.id);

		expect(result).toEqual([]);
	});
});
