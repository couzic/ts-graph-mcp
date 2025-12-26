import type Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { queryNodes } from "./queryNodes.js";
import { createSqliteWriter } from "./sqlite/createSqliteWriter.js";
import {
	closeDatabase,
	openDatabase,
} from "./sqlite/sqliteConnection.utils.js";
import { initializeSchema } from "./sqlite/sqliteSchema.utils.js";
import type { ClassNode, FunctionNode } from "./Types.js";

// Test data factory - creates minimal function nodes
const fn = (
	name: string,
	file = "src/test.ts",
	overrides = {},
): FunctionNode => ({
	id: `${file}:${name}`,
	type: "Function",
	name,
	module: "test",
	package: "main",
	filePath: file,
	startLine: 1,
	endLine: 10,
	exported: true,
	...overrides,
});

// Test data factory - creates minimal class nodes
const cls = (
	name: string,
	file = "src/test.ts",
	overrides = {},
): ClassNode => ({
	id: `${file}:${name}`,
	type: "Class",
	name,
	module: "test",
	package: "main",
	filePath: file,
	startLine: 1,
	endLine: 10,
	exported: true,
	...overrides,
});

describe.skip(queryNodes.name, () => {
	let db: Database.Database;

	beforeEach(() => {
		db = openDatabase({ path: ":memory:" });
		initializeSchema(db);
	});

	afterEach(() => {
		closeDatabase(db);
	});

	it("matches glob pattern", async () => {
		const writer = createSqliteWriter(db);
		const foo = fn("foo");
		const fooBar = fn("fooBar");
		const bar = fn("bar");
		await writer.addNodes([foo, fooBar, bar]);

		const result = queryNodes(db, "foo*");

		expect(result).toHaveLength(2);
		const names = result.map((n) => n.name);
		expect(names).toContain("foo");
		expect(names).toContain("fooBar");
		expect(names).not.toContain("bar");
	});

	it("filters by nodeType", async () => {
		const writer = createSqliteWriter(db);
		const fooFn = fn("foo");
		const fooClass = cls("Foo");
		await writer.addNodes([fooFn, fooClass]);

		const result = queryNodes(db, "*", { type: "Function" });

		expect(result).toHaveLength(1);
		expect(result[0]?.id).toBe(fooFn.id);
		expect(result[0]?.type).toBe("Function");
	});

	it("filters by exported status", async () => {
		const writer = createSqliteWriter(db);
		const exportedFoo = fn("foo", "src/test.ts", { exported: true });
		const internalBar = fn("bar", "src/test.ts", { exported: false });
		await writer.addNodes([exportedFoo, internalBar]);

		const result = queryNodes(db, "*", { exported: true });

		expect(result).toHaveLength(1);
		expect(result[0]?.id).toBe(exportedFoo.id);
		expect(result[0]?.exported).toBe(true);
	});

	it("filters by module", async () => {
		const writer = createSqliteWriter(db);
		const mod1A = fn("a", "src/mod1/a.ts", { module: "mod1" });
		const mod2B = fn("b", "src/mod2/b.ts", { module: "mod2" });
		await writer.addNodes([mod1A, mod2B]);

		const result = queryNodes(db, "*", { module: "mod1" });

		expect(result).toHaveLength(1);
		expect(result[0]?.id).toBe(mod1A.id);
		expect(result[0]?.module).toBe("mod1");
	});

	it("filters by package", async () => {
		const writer = createSqliteWriter(db);
		const pkg1A = fn("a", "src/pkg1/a.ts", { package: "pkg1" });
		const pkg2B = fn("b", "src/pkg2/b.ts", { package: "pkg2" });
		await writer.addNodes([pkg1A, pkg2B]);

		const result = queryNodes(db, "*", { package: "pkg1" });

		expect(result).toHaveLength(1);
		expect(result[0]?.id).toBe(pkg1A.id);
		expect(result[0]?.package).toBe("pkg1");
	});

	it("returns empty for no match", async () => {
		const writer = createSqliteWriter(db);
		const foo = fn("foo");
		await writer.addNodes([foo]);

		const result = queryNodes(db, "bar*");

		expect(result).toEqual([]);
	});

	it("combines multiple filters", async () => {
		const writer = createSqliteWriter(db);
		const mod1FooFn = fn("foo", "src/mod1/foo.ts", { module: "mod1" });
		const mod1FooClass = cls("Foo", "src/mod1/Foo.ts", { module: "mod1" });
		const mod2FooFn = fn("foo", "src/mod2/foo.ts", { module: "mod2" });
		await writer.addNodes([mod1FooFn, mod1FooClass, mod2FooFn]);

		const result = queryNodes(db, "foo*", {
			type: "Function",
			module: "mod1",
		});

		expect(result).toHaveLength(1);
		expect(result[0]?.id).toBe(mod1FooFn.id);
		expect(result[0]?.type).toBe("Function");
		expect(result[0]?.module).toBe("mod1");
	});

	it("supports array of node types", async () => {
		const writer = createSqliteWriter(db);
		const fooFn = fn("foo");
		const fooClass = cls("Foo");
		const fooInterface = {
			id: "src/test.ts:IFoo",
			type: "Interface" as const,
			name: "IFoo",
			module: "test",
			package: "main",
			filePath: "src/test.ts",
			startLine: 1,
			endLine: 10,
			exported: true,
		};
		await writer.addNodes([fooFn, fooClass, fooInterface]);

		const result = queryNodes(db, "*", {
			type: ["Function", "Class"],
		});

		expect(result).toHaveLength(2);
		const types = result.map((n) => n.type);
		expect(types).toContain("Function");
		expect(types).toContain("Class");
		expect(types).not.toContain("Interface");
	});

	it("supports array of modules", async () => {
		const writer = createSqliteWriter(db);
		const mod1A = fn("a", "src/mod1/a.ts", { module: "mod1" });
		const mod2B = fn("b", "src/mod2/b.ts", { module: "mod2" });
		const mod3C = fn("c", "src/mod3/c.ts", { module: "mod3" });
		await writer.addNodes([mod1A, mod2B, mod3C]);

		const result = queryNodes(db, "*", {
			module: ["mod1", "mod2"],
		});

		expect(result).toHaveLength(2);
		const modules = result.map((n) => n.module);
		expect(modules).toContain("mod1");
		expect(modules).toContain("mod2");
		expect(modules).not.toContain("mod3");
	});

	it("supports array of packages", async () => {
		const writer = createSqliteWriter(db);
		const pkg1A = fn("a", "src/pkg1/a.ts", { package: "pkg1" });
		const pkg2B = fn("b", "src/pkg2/b.ts", { package: "pkg2" });
		const pkg3C = fn("c", "src/pkg3/c.ts", { package: "pkg3" });
		await writer.addNodes([pkg1A, pkg2B, pkg3C]);

		const result = queryNodes(db, "*", {
			package: ["pkg1", "pkg2"],
		});

		expect(result).toHaveLength(2);
		const packages = result.map((n) => n.package);
		expect(packages).toContain("pkg1");
		expect(packages).toContain("pkg2");
		expect(packages).not.toContain("pkg3");
	});

	it("supports case-sensitive glob matching", async () => {
		const writer = createSqliteWriter(db);
		const foo = fn("foo");
		const Foo = cls("Foo");
		await writer.addNodes([foo, Foo]);

		const result = queryNodes(db, "foo*");

		expect(result).toHaveLength(1);
		expect(result[0]?.name).toBe("foo");
	});

	it("supports wildcard in middle of pattern", async () => {
		const writer = createSqliteWriter(db);
		const handleClick = fn("handleClick");
		const handleSubmit = fn("handleSubmit");
		const submitForm = fn("submitForm");
		await writer.addNodes([handleClick, handleSubmit, submitForm]);

		const result = queryNodes(db, "handle*");

		expect(result).toHaveLength(2);
		const names = result.map((n) => n.name);
		expect(names).toContain("handleClick");
		expect(names).toContain("handleSubmit");
		expect(names).not.toContain("submitForm");
	});

	it("supports question mark wildcard", async () => {
		const writer = createSqliteWriter(db);
		const fn1 = fn("fn1");
		const fn2 = fn("fn2");
		const fn10 = fn("fn10");
		await writer.addNodes([fn1, fn2, fn10]);

		const result = queryNodes(db, "fn?");

		expect(result).toHaveLength(2);
		const names = result.map((n) => n.name);
		expect(names).toContain("fn1");
		expect(names).toContain("fn2");
		expect(names).not.toContain("fn10"); // ? matches exactly one character
	});

	it("limits results with limit parameter", async () => {
		const writer = createSqliteWriter(db);
		const nodes = [fn("fn1"), fn("fn2"), fn("fn3"), fn("fn4"), fn("fn5")];
		await writer.addNodes(nodes);

		const result = queryNodes(db, "fn*", { limit: 3 });

		expect(result).toHaveLength(3);
		// Should return first 3 results (alphabetically sorted)
		const names = result.map((n) => n.name);
		expect(names).toEqual(["fn1", "fn2", "fn3"]);
	});

	it("skips results with offset parameter", async () => {
		const writer = createSqliteWriter(db);
		const nodes = [fn("fn1"), fn("fn2"), fn("fn3"), fn("fn4"), fn("fn5")];
		await writer.addNodes(nodes);

		const result = queryNodes(db, "fn*", { offset: 2 });

		expect(result).toHaveLength(3);
		// Should skip first 2 results (fn1, fn2)
		const names = result.map((n) => n.name);
		expect(names).toEqual(["fn3", "fn4", "fn5"]);
	});

	it("combines offset and limit for pagination", async () => {
		const writer = createSqliteWriter(db);
		const nodes = [
			fn("fn1"),
			fn("fn2"),
			fn("fn3"),
			fn("fn4"),
			fn("fn5"),
			fn("fn6"),
			fn("fn7"),
		];
		await writer.addNodes(nodes);

		const result = queryNodes(db, "fn*", { offset: 2, limit: 3 });

		expect(result).toHaveLength(3);
		// Skip first 2, return next 3
		const names = result.map((n) => n.name);
		expect(names).toEqual(["fn3", "fn4", "fn5"]);
	});

	it("handles offset beyond results", async () => {
		const writer = createSqliteWriter(db);
		const nodes = [fn("fn1"), fn("fn2"), fn("fn3")];
		await writer.addNodes(nodes);

		const result = queryNodes(db, "fn*", { offset: 10 });

		expect(result).toEqual([]);
	});

	it("handles limit larger than results", async () => {
		const writer = createSqliteWriter(db);
		const nodes = [fn("fn1"), fn("fn2"), fn("fn3")];
		await writer.addNodes(nodes);

		const result = queryNodes(db, "fn*", { limit: 100 });

		expect(result).toHaveLength(3);
	});
});
