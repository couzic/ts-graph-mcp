import { describe, expect, it } from "vitest";
import type { Edge } from "../../../db/Types.js";
import { formatPath } from "./format.js";
import type { PathResult } from "./query.js";

describe(formatPath.name, () => {
	it("formats null path as not found", () => {
		const result = formatPath("src/a.ts:foo", "src/b.ts:bar", null);

		expect(result).toContain("sourceId: src/a.ts:foo");
		expect(result).toContain("targetId: src/b.ts:bar");
		expect(result).toContain("found: false");
		expect(result).toContain("(no path exists between these nodes)");
		expect(result).not.toContain("length:");
	});

	it("formats simple two-node path", () => {
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

		const result = formatPath("src/a.ts:foo", "src/b.ts:bar", path);

		expect(result).toContain("sourceId: src/a.ts:foo");
		expect(result).toContain("targetId: src/b.ts:bar");
		expect(result).toContain("found: true");
		expect(result).toContain("length: 1");
		expect(result).toContain("path: src/a.ts:foo --CALLS--> src/b.ts:bar");
	});

	it("formats three-node path with multiple edge types", () => {
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

		const result = formatPath("src/a.ts:A", "src/c.ts:C", path);

		expect(result).toContain("found: true");
		expect(result).toContain("length: 2");
		expect(result).toContain(
			"path: src/a.ts:A --CALLS--> src/b.ts:B --IMPORTS--> src/c.ts:C",
		);
	});

	it("formats long path correctly", () => {
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

		const result = formatPath("src/a.ts:start", "src/e.ts:end", path);

		expect(result).toContain("length: 4");
		expect(result).toContain("--CALLS-->");
		expect(result).toContain("--USES_TYPE-->");
		expect(result).toContain("--EXTENDS-->");
	});

	it("handles single-node path (source equals target)", () => {
		const path: PathResult = {
			nodes: ["src/a.ts:foo"],
			edges: [],
		};

		const result = formatPath("src/a.ts:foo", "src/a.ts:foo", path);

		expect(result).toContain("found: true");
		expect(result).toContain("length: 0");
		expect(result).toContain("path: src/a.ts:foo");
		expect(result).not.toContain("-->");
	});

	it("handles IMPLEMENTS edge type", () => {
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

		const result = formatPath(
			"src/interface.ts:IFoo",
			"src/class.ts:Foo",
			path,
		);

		expect(result).toContain("--IMPLEMENTS-->");
	});

	it("handles CONTAINS edge type", () => {
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

		const result = formatPath("src/file.ts", "src/file.ts:MyClass", path);

		expect(result).toContain("--CONTAINS-->");
	});

	it("preserves node ID format with colons", () => {
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

		const result = formatPath(
			"src/models/User.ts:User.save",
			"src/db/Repo.ts:Repo.insert",
			path,
		);

		expect(result).toContain("sourceId: src/models/User.ts:User.save");
		expect(result).toContain("targetId: src/db/Repo.ts:Repo.insert");
		expect(result).toContain(
			"path: src/models/User.ts:User.save --CALLS--> src/db/Repo.ts:Repo.insert",
		);
	});
});
