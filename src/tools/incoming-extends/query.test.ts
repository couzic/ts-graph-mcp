import type Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	closeDatabase,
	openDatabase,
} from "../../db/sqlite/SqliteConnection.js";
import { initializeSchema } from "../../db/sqlite/SqliteSchema.js";
import { createSqliteWriter } from "../../db/sqlite/SqliteWriter.js";
import type { ClassNode, Edge, InterfaceNode } from "../../db/Types.js";
import { queryDescendants } from "./query.js";

// Test data factory - creates minimal class nodes
const classNode = (
	name: string,
	file = "src/test.ts",
	module = "test",
): ClassNode => ({
	id: `${file}:${name}`,
	type: "Class",
	name,
	module,
	package: "main",
	filePath: file,
	startLine: 1,
	endLine: 10,
	exported: true,
});

// Test data factory - creates minimal interface nodes
const interfaceNode = (
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

const extends_ = (from: string, to: string): Edge => ({
	source: from,
	target: to,
	type: "EXTENDS",
});

describe(queryDescendants.name, () => {
	let db: Database.Database;

	beforeEach(() => {
		db = openDatabase({ path: ":memory:" });
		initializeSchema(db);
	});

	afterEach(() => {
		closeDatabase(db);
	});

	it("returns empty array when node has no descendants", async () => {
		const writer = createSqliteWriter(db);
		const base = classNode("BaseService");
		await writer.addNodes([base]);

		const result = queryDescendants(db, base.id);

		expect(result).toEqual([]);
	});

	it("returns direct descendants (class extending class)", async () => {
		const writer = createSqliteWriter(db);
		const base = classNode("BaseService");
		const child = classNode("UserService");
		await writer.addNodes([base, child]);
		await writer.addEdges([extends_(child.id, base.id)]);

		const result = queryDescendants(db, base.id);

		expect(result).toHaveLength(1);
		expect(result[0]?.id).toBe(child.id);
	});

	it("returns transitive descendants (full hierarchy)", async () => {
		const writer = createSqliteWriter(db);
		const base = classNode("BaseService");
		const child = classNode("UserService");
		const grandchild = classNode("AdminUserService");
		await writer.addNodes([base, child, grandchild]);
		await writer.addEdges([
			extends_(child.id, base.id), // UserService → BaseService
			extends_(grandchild.id, child.id), // AdminUserService → UserService
		]);

		const result = queryDescendants(db, base.id);

		expect(result).toHaveLength(2);
		const ids = result.map((n) => n.id);
		expect(ids).toContain(child.id);
		expect(ids).toContain(grandchild.id);
	});

	it("respects maxDepth=1 to return only direct descendants", async () => {
		const writer = createSqliteWriter(db);
		const base = classNode("BaseService");
		const child = classNode("UserService");
		const grandchild = classNode("AdminUserService");
		await writer.addNodes([base, child, grandchild]);
		await writer.addEdges([
			extends_(child.id, base.id), // UserService → BaseService
			extends_(grandchild.id, child.id), // AdminUserService → UserService
		]);

		const result = queryDescendants(db, base.id, { maxDepth: 1 });

		expect(result).toHaveLength(1);
		expect(result[0]?.id).toBe(child.id);
	});

	it("handles multiple children at same level", async () => {
		const writer = createSqliteWriter(db);
		const base = classNode("BaseService");
		const child1 = classNode("UserService");
		const child2 = classNode("AdminService");
		await writer.addNodes([base, child1, child2]);
		await writer.addEdges([
			extends_(child1.id, base.id), // UserService → BaseService
			extends_(child2.id, base.id), // AdminService → BaseService
		]);

		const result = queryDescendants(db, base.id);

		expect(result).toHaveLength(2);
		const ids = result.map((n) => n.id);
		expect(ids).toContain(child1.id);
		expect(ids).toContain(child2.id);
	});

	it("works with interfaces extending interfaces", async () => {
		const writer = createSqliteWriter(db);
		const base = interfaceNode("Entity");
		const child = interfaceNode("Auditable");
		await writer.addNodes([base, child]);
		await writer.addEdges([extends_(child.id, base.id)]);

		const result = queryDescendants(db, base.id);

		expect(result).toHaveLength(1);
		expect(result[0]?.id).toBe(child.id);
	});

	it("filters descendants by module", async () => {
		const writer = createSqliteWriter(db);
		const base = classNode("BaseService", "src/base.ts", "base");
		const child1 = classNode("UserService", "src/mod1/user.ts", "mod1");
		const child2 = classNode("AdminService", "src/mod2/admin.ts", "mod2");
		await writer.addNodes([base, child1, child2]);
		await writer.addEdges([
			extends_(child1.id, base.id), // UserService (mod1) → BaseService
			extends_(child2.id, base.id), // AdminService (mod2) → BaseService
		]);

		const result = queryDescendants(db, base.id, { moduleFilter: ["mod1"] });

		expect(result).toHaveLength(1);
		expect(result[0]?.id).toBe(child1.id);
	});

	it("returns descendants from multiple files", async () => {
		const writer = createSqliteWriter(db);
		const base = classNode("BaseService", "src/base.ts");
		const child1 = classNode("UserService", "src/user.ts");
		const child2 = classNode("AdminService", "src/admin.ts");
		await writer.addNodes([base, child1, child2]);
		await writer.addEdges([
			extends_(child1.id, base.id),
			extends_(child2.id, base.id),
		]);

		const result = queryDescendants(db, base.id);

		expect(result).toHaveLength(2);
		const ids = result.map((n) => n.id);
		expect(ids).toContain(child1.id);
		expect(ids).toContain(child2.id);
	});

	it("ignores non-EXTENDS edges (IMPLEMENTS)", async () => {
		const writer = createSqliteWriter(db);
		const iface = interfaceNode("Auditable");
		const impl = classNode("AuditLog");
		await writer.addNodes([iface, impl]);
		await writer.addEdges([
			{ source: impl.id, target: iface.id, type: "IMPLEMENTS" }, // Not EXTENDS
		]);

		const result = queryDescendants(db, iface.id);

		expect(result).toEqual([]);
	});

	it("sorts results by name for consistent output", async () => {
		const writer = createSqliteWriter(db);
		const base = classNode("BaseService");
		const childZ = classNode("ZService");
		const childA = classNode("AService");
		await writer.addNodes([base, childZ, childA]);
		await writer.addEdges([
			extends_(childZ.id, base.id),
			extends_(childA.id, base.id),
		]);

		const result = queryDescendants(db, base.id);

		expect(result).toHaveLength(2);
		expect(result[0]?.name).toBe("AService");
		expect(result[1]?.name).toBe("ZService");
	});
});
