import type Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	closeDatabase,
	openDatabase,
} from "../../db/sqlite/SqliteConnection.js";
import { initializeSchema } from "../../db/sqlite/SqliteSchema.js";
import { createSqliteWriter } from "../../db/sqlite/SqliteWriter.js";
import type {
	ClassNode,
	FileNode,
	FunctionNode,
	InterfaceNode,
} from "../../db/Types.js";
import { queryFileNodes } from "./query.js";

// Test data factories
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

const cls = (name: string, file = "src/test.ts"): ClassNode => ({
	id: `${file}:${name}`,
	type: "Class",
	name,
	module: "test",
	package: "main",
	filePath: file,
	startLine: 1,
	endLine: 20,
	exported: true,
});

const iface = (name: string, file = "src/test.ts"): InterfaceNode => ({
	id: `${file}:${name}`,
	type: "Interface",
	name,
	module: "test",
	package: "main",
	filePath: file,
	startLine: 1,
	endLine: 15,
	exported: true,
});

const fileNode = (file = "src/test.ts"): FileNode => ({
	id: file,
	type: "File",
	name: file.split("/").pop() || file,
	module: "test",
	package: "main",
	filePath: file,
	startLine: 1,
	endLine: 1,
	exported: false,
	extension: ".ts",
});

describe(queryFileNodes.name, () => {
	let db: Database.Database;

	beforeEach(() => {
		db = openDatabase({ path: ":memory:" });
		initializeSchema(db);
	});

	afterEach(() => {
		closeDatabase(db);
	});

	it("returns all symbols in file", async () => {
		const writer = createSqliteWriter(db);
		const foo = fn("foo", "src/a.ts");
		const Bar = cls("Bar", "src/a.ts");
		await writer.addNodes([foo, Bar]);

		const result = queryFileNodes(db, "src/a.ts");

		expect(result).toHaveLength(2);
		const ids = result.map((n) => n.id);
		expect(ids).toContain(foo.id);
		expect(ids).toContain(Bar.id);
	});

	it("returns empty for unknown file", async () => {
		const writer = createSqliteWriter(db);
		const foo = fn("foo", "src/a.ts");
		await writer.addNodes([foo]);

		const result = queryFileNodes(db, "src/b.ts");

		expect(result).toEqual([]);
	});

	it("includes File nodes", async () => {
		const writer = createSqliteWriter(db);
		const file = fileNode("src/test.ts");
		const foo = fn("foo", "src/test.ts");
		await writer.addNodes([file, foo]);

		const result = queryFileNodes(db, "src/test.ts");

		expect(result).toHaveLength(2);
		const types = result.map((n) => n.type);
		expect(types).toContain("File");
		expect(types).toContain("Function");
	});

	it("returns symbols from correct file only", async () => {
		const writer = createSqliteWriter(db);
		const a = fn("a", "src/file1.ts");
		const b = fn("b", "src/file2.ts");
		await writer.addNodes([a, b]);

		const result = queryFileNodes(db, "src/file1.ts");

		expect(result).toHaveLength(1);
		expect(result[0]?.id).toBe(a.id);
	});

	it("returns multiple node types", async () => {
		const writer = createSqliteWriter(db);
		const foo = fn("foo", "src/test.ts");
		const Bar = cls("Bar", "src/test.ts");
		const IBaz = iface("IBaz", "src/test.ts");
		await writer.addNodes([foo, Bar, IBaz]);

		const result = queryFileNodes(db, "src/test.ts");

		expect(result).toHaveLength(3);
		const types = result.map((n) => n.type);
		expect(types).toContain("Function");
		expect(types).toContain("Class");
		expect(types).toContain("Interface");
	});
});
