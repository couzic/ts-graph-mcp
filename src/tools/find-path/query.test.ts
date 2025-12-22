import type Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createSqliteWriter } from "../../db/sqlite/createSqliteWriter.js";
import {
	closeDatabase,
	openDatabase,
} from "../../db/sqlite/sqliteConnection.utils.js";
import { initializeSchema } from "../../db/sqlite/sqliteSchema.utils.js";
import type { Edge, FunctionNode } from "../../db/Types.js";
import { queryPath } from "./query.js";

const fn = (name: string, file = "src/test.ts"): FunctionNode => ({
	id: `${file}:${name}`,
	type: "Function",
	name,
	module: "test",
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

describe(queryPath.name, () => {
	let db: Database.Database;

	beforeEach(() => {
		db = openDatabase({ path: ":memory:" });
		initializeSchema(db);
	});

	afterEach(() => {
		closeDatabase(db);
	});

	it("returns null when no path exists", async () => {
		const writer = createSqliteWriter(db);
		const nodeA = fn("fnA");
		const nodeB = fn("fnB");

		// Add two disconnected nodes
		await writer.addNodes([nodeA, nodeB]);

		const result = queryPath(db, nodeA.id, nodeB.id);

		expect(result).toBeNull();
	});

	it("finds direct path", async () => {
		const writer = createSqliteWriter(db);
		const nodeA = fn("fnA");
		const nodeB = fn("fnB");
		const edge = calls(nodeA.id, nodeB.id);

		await writer.addNodes([nodeA, nodeB]);
		await writer.addEdges([edge]);

		const result = queryPath(db, nodeA.id, nodeB.id);

		expect(result).not.toBeNull();
		expect(result?.nodes).toEqual([nodeA.id, nodeB.id]);
		expect(result?.edges).toHaveLength(1);
		expect(result?.edges[0]?.source).toBe(nodeA.id);
		expect(result?.edges[0]?.target).toBe(nodeB.id);
	});

	it("finds multi-hop path", async () => {
		const writer = createSqliteWriter(db);
		const nodeA = fn("fnA");
		const nodeB = fn("fnB");
		const nodeC = fn("fnC");

		// A → B → C
		await writer.addNodes([nodeA, nodeB, nodeC]);
		await writer.addEdges([
			calls(nodeA.id, nodeB.id),
			calls(nodeB.id, nodeC.id),
		]);

		const result = queryPath(db, nodeA.id, nodeC.id);

		expect(result).not.toBeNull();
		expect(result?.nodes).toEqual([nodeA.id, nodeB.id, nodeC.id]);
		expect(result?.edges).toHaveLength(2);
	});

	it("finds shortest path", async () => {
		const writer = createSqliteWriter(db);
		const nodeA = fn("fnA");
		const nodeB = fn("fnB");
		const nodeC = fn("fnC");

		// A → B → C AND A → C (direct is shorter)
		await writer.addNodes([nodeA, nodeB, nodeC]);
		await writer.addEdges([
			calls(nodeA.id, nodeB.id),
			calls(nodeB.id, nodeC.id),
			calls(nodeA.id, nodeC.id), // Direct path
		]);

		const result = queryPath(db, nodeA.id, nodeC.id);

		expect(result).not.toBeNull();
		expect(result?.nodes).toEqual([nodeA.id, nodeC.id]);
		expect(result?.edges).toHaveLength(1);
		expect(result?.edges[0]?.source).toBe(nodeA.id);
		expect(result?.edges[0]?.target).toBe(nodeC.id);
	});

	it("returns null for non-existent source", async () => {
		const writer = createSqliteWriter(db);
		const nodeB = fn("fnB");

		await writer.addNodes([nodeB]);

		const result = queryPath(db, "nonexistent:node", nodeB.id);

		expect(result).toBeNull();
	});

	it("returns null for non-existent target", async () => {
		const writer = createSqliteWriter(db);
		const nodeA = fn("fnA");

		await writer.addNodes([nodeA]);

		const result = queryPath(db, nodeA.id, "nonexistent:node");

		expect(result).toBeNull();
	});

	it("includes edges in path result", async () => {
		const writer = createSqliteWriter(db);
		const nodeA = fn("fnA");
		const nodeB = fn("fnB");
		const nodeC = fn("fnC");
		const nodeD = fn("fnD");

		// A → B → C → D
		await writer.addNodes([nodeA, nodeB, nodeC, nodeD]);
		await writer.addEdges([
			calls(nodeA.id, nodeB.id),
			calls(nodeB.id, nodeC.id),
			calls(nodeC.id, nodeD.id),
		]);

		const result = queryPath(db, nodeA.id, nodeD.id);

		expect(result).not.toBeNull();
		expect(result?.nodes).toEqual([nodeA.id, nodeB.id, nodeC.id, nodeD.id]);
		expect(result?.edges).toHaveLength(3);

		// Verify edges connect consecutive nodes
		expect(result?.edges[0]?.source).toBe(nodeA.id);
		expect(result?.edges[0]?.target).toBe(nodeB.id);
		expect(result?.edges[1]?.source).toBe(nodeB.id);
		expect(result?.edges[1]?.target).toBe(nodeC.id);
		expect(result?.edges[2]?.source).toBe(nodeC.id);
		expect(result?.edges[2]?.target).toBe(nodeD.id);
	});
});
