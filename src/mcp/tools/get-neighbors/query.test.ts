import type Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	closeDatabase,
	openDatabase,
} from "../../../db/sqlite/SqliteConnection.js";
import { initializeSchema } from "../../../db/sqlite/SqliteSchema.js";
import { createSqliteWriter } from "../../../db/sqlite/SqliteWriter.js";
import type { Edge, FunctionNode } from "../../../db/Types.js";
import { queryNeighbors } from "./query.js";

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

describe(queryNeighbors.name, () => {
	let db: Database.Database;

	beforeEach(() => {
		db = openDatabase({ path: ":memory:" });
		initializeSchema(db);
	});

	afterEach(() => {
		closeDatabase(db);
	});

	it("returns center node", async () => {
		const writer = createSqliteWriter(db);
		const a = fn("A");
		await writer.addNodes([a]);

		const result = queryNeighbors(db, a.id, 1, "both");

		expect(result.center).toEqual(a);
	});

	it("returns outgoing neighbors", async () => {
		const writer = createSqliteWriter(db);
		const a = fn("A");
		const b = fn("B");
		const c = fn("C");
		await writer.addNodes([a, b, c]);
		await writer.addEdges([calls(a.id, b.id), calls(a.id, c.id)]);

		const result = queryNeighbors(db, a.id, 1, "outgoing");

		const nodeIds = result.nodes.map((n) => n.id).sort();
		expect(nodeIds).toEqual([a.id, b.id, c.id].sort());
	});

	it("returns incoming neighbors", async () => {
		const writer = createSqliteWriter(db);
		const a = fn("A");
		const b = fn("B");
		const c = fn("C");
		await writer.addNodes([a, b, c]);
		await writer.addEdges([calls(b.id, a.id), calls(c.id, a.id)]);

		const result = queryNeighbors(db, a.id, 1, "incoming");

		const nodeIds = result.nodes.map((n) => n.id).sort();
		expect(nodeIds).toEqual([a.id, b.id, c.id].sort());
	});

	it("returns both directions", async () => {
		const writer = createSqliteWriter(db);
		const a = fn("A");
		const b = fn("B");
		const c = fn("C");
		await writer.addNodes([a, b, c]);
		await writer.addEdges([calls(b.id, a.id), calls(a.id, c.id)]);

		const result = queryNeighbors(db, a.id, 1, "both");

		const nodeIds = result.nodes.map((n) => n.id).sort();
		expect(nodeIds).toEqual([a.id, b.id, c.id].sort());
	});

	it("respects distance=1", async () => {
		const writer = createSqliteWriter(db);
		const a = fn("A");
		const b = fn("B");
		const c = fn("C");
		await writer.addNodes([a, b, c]);
		await writer.addEdges([calls(a.id, b.id), calls(b.id, c.id)]);

		const result = queryNeighbors(db, a.id, 1, "outgoing");

		const nodeIds = result.nodes.map((n) => n.id).sort();
		expect(nodeIds).toEqual([a.id, b.id].sort());
		expect(nodeIds).not.toContain(c.id);
	});

	it("respects distance=2", async () => {
		const writer = createSqliteWriter(db);
		const a = fn("A");
		const b = fn("B");
		const c = fn("C");
		await writer.addNodes([a, b, c]);
		await writer.addEdges([calls(a.id, b.id), calls(b.id, c.id)]);

		const result = queryNeighbors(db, a.id, 2, "outgoing");

		const nodeIds = result.nodes.map((n) => n.id).sort();
		expect(nodeIds).toEqual([a.id, b.id, c.id].sort());
	});

	it("returns edges between neighbors", async () => {
		const writer = createSqliteWriter(db);
		const a = fn("A");
		const b = fn("B");
		const c = fn("C");
		await writer.addNodes([a, b, c]);
		await writer.addEdges([
			calls(a.id, b.id),
			calls(b.id, c.id),
			calls(a.id, c.id),
		]);

		const result = queryNeighbors(db, a.id, 2, "outgoing");

		expect(result.edges.length).toBeGreaterThan(0);
		const edgePairs = result.edges
			.map((e) => `${e.source}->${e.target}`)
			.sort();
		expect(edgePairs).toContain(`${a.id}->${b.id}`);
		expect(edgePairs).toContain(`${b.id}->${c.id}`);
		expect(edgePairs).toContain(`${a.id}->${c.id}`);
	});

	it("throws for non-existent node", () => {
		expect(() => {
			queryNeighbors(db, "nonexistent", 1, "both");
		}).toThrow("Node not found: nonexistent");
	});
});
