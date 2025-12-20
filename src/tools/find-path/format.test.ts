import { describe, expect, it } from "vitest";
import type { Edge } from "../../db/Types.js";
import type { SymbolLocation } from "../shared/resolveSymbol.js";
import { formatPath } from "./format.js";
import type { PathResult } from "./query.js";

/**
 * Helper to create a SymbolLocation for testing.
 */
function createSymbolLocation(
	id: string,
	type = "Function",
	file = "src/test.ts",
): SymbolLocation {
	const parts = id.split(":");
	const name = parts[parts.length - 1] ?? id;
	return {
		id,
		name,
		type,
		file,
		offset: 1,
		limit: 10,
		module: "test",
		package: "test",
	};
}

describe(formatPath.name, () => {
	it("formats null path as not found", () => {
		const from = createSymbolLocation("src/a.ts:foo");
		const to = createSymbolLocation("src/b.ts:bar");
		const result = formatPath(from, to, null);

		expect(result).toContain("from: foo (Function)");
		expect(result).toContain("to: bar (Function)");
		expect(result).toContain("found: false");
		expect(result).toContain("(no path exists between these nodes)");
		expect(result).not.toContain("length:");
	});

	it("formats simple two-node path", () => {
		const from = createSymbolLocation("src/a.ts:foo");
		const to = createSymbolLocation("src/b.ts:bar");
		const path: PathResult = {
			nodes: ["src/a.ts:foo", "src/b.ts:bar"],
			edges: [
				{
					source: "src/a.ts:foo",
					target: "src/b.ts:bar",
					type: "CALLS",
				} as Edge,
			],
		};

		const result = formatPath(from, to, path);

		expect(result).toContain("from: foo (Function)");
		expect(result).toContain("to: bar (Function)");
		expect(result).toContain("found: true");
		expect(result).toContain("length: 1");
		expect(result).toContain("path: foo --CALLS--> bar");
	});

	it("formats three-node path with multiple edge types", () => {
		const from = createSymbolLocation("src/a.ts:A");
		const to = createSymbolLocation("src/c.ts:C");
		const path: PathResult = {
			nodes: ["src/a.ts:A", "src/b.ts:B", "src/c.ts:C"],
			edges: [
				{
					source: "src/a.ts:A",
					target: "src/b.ts:B",
					type: "CALLS",
				} as Edge,
				{
					source: "src/b.ts:B",
					target: "src/c.ts:C",
					type: "IMPORTS",
				} as Edge,
			],
		};

		const result = formatPath(from, to, path);

		expect(result).toContain("found: true");
		expect(result).toContain("length: 2");
		expect(result).toContain("path: A --CALLS--> B --IMPORTS--> C");
	});

	it("formats long path correctly", () => {
		const from = createSymbolLocation("src/a.ts:start");
		const to = createSymbolLocation("src/e.ts:end");
		const path: PathResult = {
			nodes: [
				"src/a.ts:start",
				"src/b.ts:mid1",
				"src/c.ts:mid2",
				"src/d.ts:mid3",
				"src/e.ts:end",
			],
			edges: [
				{ source: "src/a.ts:start", target: "src/b.ts:mid1", type: "CALLS" },
				{ source: "src/b.ts:mid1", target: "src/c.ts:mid2", type: "USES_TYPE" },
				{ source: "src/c.ts:mid2", target: "src/d.ts:mid3", type: "EXTENDS" },
				{ source: "src/d.ts:mid3", target: "src/e.ts:end", type: "CALLS" },
			] as Edge[],
		};

		const result = formatPath(from, to, path);

		expect(result).toContain("length: 4");
		expect(result).toContain("--CALLS-->");
		expect(result).toContain("--USES_TYPE-->");
		expect(result).toContain("--EXTENDS-->");
	});

	it("handles single-node path (source equals target)", () => {
		const from = createSymbolLocation("src/a.ts:foo");
		const to = createSymbolLocation("src/a.ts:foo");
		const path: PathResult = {
			nodes: ["src/a.ts:foo"],
			edges: [],
		};

		const result = formatPath(from, to, path);

		expect(result).toContain("found: true");
		expect(result).toContain("length: 0");
		expect(result).toContain("path: foo");
		expect(result).not.toContain("-->");
	});

	it("handles IMPLEMENTS edge type", () => {
		const from = createSymbolLocation("src/interface.ts:IFoo");
		const to = createSymbolLocation("src/class.ts:Foo");
		const path: PathResult = {
			nodes: ["src/interface.ts:IFoo", "src/class.ts:Foo"],
			edges: [
				{
					source: "src/interface.ts:IFoo",
					target: "src/class.ts:Foo",
					type: "IMPLEMENTS",
				} as Edge,
			],
		};

		const result = formatPath(from, to, path);

		expect(result).toContain("--IMPLEMENTS-->");
	});

	it("handles CONTAINS edge type", () => {
		const from = createSymbolLocation("src/file.ts", "File");
		const to = createSymbolLocation("src/file.ts:MyClass", "Class");
		const path: PathResult = {
			nodes: ["src/file.ts", "src/file.ts:MyClass"],
			edges: [
				{
					source: "src/file.ts",
					target: "src/file.ts:MyClass",
					type: "CONTAINS",
				} as Edge,
			],
		};

		const result = formatPath(from, to, path);

		expect(result).toContain("--CONTAINS-->");
	});

	it("preserves node ID format with colons", () => {
		const from = createSymbolLocation("src/models/User.ts:User.save", "Method");
		const to = createSymbolLocation("src/db/Repo.ts:Repo.insert", "Method");
		const path: PathResult = {
			nodes: ["src/models/User.ts:User.save", "src/db/Repo.ts:Repo.insert"],
			edges: [
				{
					source: "src/models/User.ts:User.save",
					target: "src/db/Repo.ts:Repo.insert",
					type: "CALLS",
				} as Edge,
			],
		};

		const result = formatPath(from, to, path);

		expect(result).toContain("from: User.save (Method)");
		expect(result).toContain("to: Repo.insert (Method)");
		expect(result).toContain("path: User.save --CALLS--> Repo.insert");
	});
});
