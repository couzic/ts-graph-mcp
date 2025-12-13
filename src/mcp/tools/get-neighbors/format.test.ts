import { describe, expect, it } from "vitest";
import type { Node } from "../../../db/Types.js";
import { formatNeighbors } from "./format.js";
import type { NeighborResult } from "./query.js";

describe(formatNeighbors.name, () => {
	it("formats basic neighbor result with header info", () => {
		const result: NeighborResult = {
			center: {
				id: "src/types.ts:User",
				type: "Interface",
				name: "User",
				module: "test",
				package: "main",
				filePath: "src/types.ts",
				startLine: 10,
				endLine: 20,
				exported: true,
			},
			nodes: [
				{
					id: "src/types.ts:User",
					type: "Interface",
					name: "User",
					module: "test",
					package: "main",
					filePath: "src/types.ts",
					startLine: 10,
					endLine: 20,
					exported: true,
				},
			],
			edges: [],
		};

		const output = formatNeighbors(result, 1, "both");

		expect(output).toContain("center: src/types.ts:User");
		expect(output).toContain("centerType: Interface");
		expect(output).toContain("distance: 1");
		expect(output).toContain("direction: both");
		expect(output).toContain("nodeCount: 0"); // center excluded
		expect(output).toContain("edgeCount: 0");
	});

	it("excludes center node from grouped neighbor list", () => {
		const center: Node = {
			id: "src/types.ts:User",
			type: "Interface",
			name: "User",
			module: "test",
			package: "main",
			filePath: "src/types.ts",
			startLine: 10,
			endLine: 20,
			exported: true,
		};

		const neighbor: Node = {
			id: "src/types.ts:Admin",
			type: "Interface",
			name: "Admin",
			module: "test",
			package: "main",
			filePath: "src/types.ts",
			startLine: 25,
			endLine: 30,
			exported: true,
			extends: ["User"],
		};

		const result: NeighborResult = {
			center,
			nodes: [center, neighbor],
			edges: [
				{
					source: "src/types.ts:Admin",
					target: "src/types.ts:User",
					type: "EXTENDS",
				},
			],
		};

		const output = formatNeighbors(result, 1, "incoming");

		// Should show 1 neighbor (not 2, since center is excluded)
		expect(output).toContain("nodeCount: 1");
		expect(output).toContain("interfaces[1]:");
		expect(output).toContain("Admin [25-30] exp extends:[User]");
		// Center should NOT appear in the interfaces list
		expect(output.match(/interfaces\[1\]/)).toBeTruthy();
	});

	it("formats function node with parameters and return type", () => {
		const result: NeighborResult = {
			center: {
				id: "src/utils.ts:formatDate",
				type: "Function",
				name: "formatDate",
				module: "test",
				package: "main",
				filePath: "src/utils.ts",
				startLine: 5,
				endLine: 15,
				exported: true,
				async: true,
				parameters: [
					{ name: "date", type: "Date" },
					{ name: "format", type: "string" },
				],
				returnType: "string",
			},
			nodes: [],
			edges: [],
		};

		const output = formatNeighbors(result, 1, "outgoing");

		expect(output).toContain("centerType: Function");
		expect(output).toContain("line: 5-15");
		expect(output).toContain("exported: true");
		expect(output).toContain("async: true");
		expect(output).toContain("params: (date:Date, format:string)");
		expect(output).toContain("returns: string");
	});

	it("formats class node with inheritance info", () => {
		const result: NeighborResult = {
			center: {
				id: "src/models.ts:UserService",
				type: "Class",
				name: "UserService",
				module: "test",
				package: "main",
				filePath: "src/models.ts",
				startLine: 1,
				endLine: 50,
				exported: true,
				extends: "BaseService",
				implements: ["IUserService", "IDisposable"],
			},
			nodes: [],
			edges: [],
		};

		const output = formatNeighbors(result, 2, "both");

		expect(output).toContain("centerType: Class");
		expect(output).toContain("extends: BaseService");
		expect(output).toContain("implements: [IUserService, IDisposable]");
	});

	it("formats edges with source and target symbols", () => {
		const center: Node = {
			id: "src/file.ts",
			type: "File",
			name: "file.ts",
			module: "test",
			package: "main",
			filePath: "src/file.ts",
			startLine: 1,
			endLine: 100,
			exported: false,
			extension: ".ts",
		};

		const func: Node = {
			id: "src/file.ts:myFunc",
			type: "Function",
			name: "myFunc",
			module: "test",
			package: "main",
			filePath: "src/file.ts",
			startLine: 10,
			endLine: 20,
			exported: true,
		};

		const result: NeighborResult = {
			center,
			nodes: [center, func],
			edges: [
				{
					source: "src/file.ts",
					target: "src/file.ts:myFunc",
					type: "CONTAINS",
				},
			],
		};

		const output = formatNeighbors(result, 1, "outgoing");

		expect(output).toContain("edges[1]:");
		expect(output).toContain("src/file.ts --CONTAINS--> myFunc");
	});

	it("formats CALLS edges with call count when > 1", () => {
		const center: Node = {
			id: "src/a.ts:caller",
			type: "Function",
			name: "caller",
			module: "test",
			package: "main",
			filePath: "src/a.ts",
			startLine: 1,
			endLine: 10,
			exported: false,
		};

		const callee: Node = {
			id: "src/b.ts:callee",
			type: "Function",
			name: "callee",
			module: "test",
			package: "main",
			filePath: "src/b.ts",
			startLine: 1,
			endLine: 10,
			exported: false,
		};

		const result: NeighborResult = {
			center,
			nodes: [center, callee],
			edges: [
				{
					source: "src/a.ts:caller",
					target: "src/b.ts:callee",
					type: "CALLS",
					callCount: 5,
				},
			],
		};

		const output = formatNeighbors(result, 1, "outgoing");

		expect(output).toContain("caller --CALLS(5)--> callee");
	});

	it("generates Mermaid diagram", () => {
		const center: Node = {
			id: "src/a.ts:A",
			type: "Function",
			name: "A",
			module: "test",
			package: "main",
			filePath: "src/a.ts",
			startLine: 1,
			endLine: 10,
			exported: false,
		};

		const neighbor: Node = {
			id: "src/b.ts:B",
			type: "Class",
			name: "B",
			module: "test",
			package: "main",
			filePath: "src/b.ts",
			startLine: 1,
			endLine: 20,
			exported: true,
		};

		const result: NeighborResult = {
			center,
			nodes: [center, neighbor],
			edges: [
				{
					source: "src/a.ts:A",
					target: "src/b.ts:B",
					type: "USES_TYPE",
				},
			],
		};

		const output = formatNeighbors(result, 1, "both");

		expect(output).toContain("---mermaid---");
		expect(output).toContain("graph LR");
		expect(output).toContain('n0["A()"]'); // Function gets ()
		expect(output).toContain('n1["B"]'); // Class without ()
		expect(output).toContain("n0 -->|uses type| n1");
	});

	it("shows no neighbors message when only center exists", () => {
		const result: NeighborResult = {
			center: {
				id: "src/lonely.ts:alone",
				type: "Function",
				name: "alone",
				module: "test",
				package: "main",
				filePath: "src/lonely.ts",
				startLine: 1,
				endLine: 5,
				exported: false,
			},
			nodes: [
				{
					id: "src/lonely.ts:alone",
					type: "Function",
					name: "alone",
					module: "test",
					package: "main",
					filePath: "src/lonely.ts",
					startLine: 1,
					endLine: 5,
					exported: false,
				},
			],
			edges: [],
		};

		const output = formatNeighbors(result, 1, "both");

		expect(output).toContain("nodeCount: 0");
		expect(output).toContain("(no neighbors found)");
	});

	it("groups multiple nodes by file and type", () => {
		const center: Node = {
			id: "src/a.ts:main",
			type: "Function",
			name: "main",
			module: "test",
			package: "main",
			filePath: "src/a.ts",
			startLine: 1,
			endLine: 10,
			exported: true,
		};

		const nodes: Node[] = [
			center,
			{
				id: "src/a.ts:helper",
				type: "Function",
				name: "helper",
				module: "test",
				package: "main",
				filePath: "src/a.ts",
				startLine: 15,
				endLine: 20,
				exported: false,
			},
			{
				id: "src/types.ts:Config",
				type: "Interface",
				name: "Config",
				module: "test",
				package: "main",
				filePath: "src/types.ts",
				startLine: 1,
				endLine: 10,
				exported: true,
			},
			{
				id: "src/types.ts:Options",
				type: "Interface",
				name: "Options",
				module: "test",
				package: "main",
				filePath: "src/types.ts",
				startLine: 12,
				endLine: 20,
				exported: true,
			},
		];

		const result: NeighborResult = {
			center,
			nodes,
			edges: [],
		};

		const output = formatNeighbors(result, 2, "both");

		expect(output).toContain("nodeCount: 3"); // excludes center
		expect(output).toContain("src/a.ts (1 nodes):");
		expect(output).toContain("functions[1]:");
		expect(output).toContain("helper [15-20]");
		expect(output).toContain("src/types.ts (2 nodes):");
		expect(output).toContain("interfaces[2]:");
		expect(output).toContain("Config [1-10] exp");
		expect(output).toContain("Options [12-20] exp");
	});

	it("formats type alias with aliased type", () => {
		const result: NeighborResult = {
			center: {
				id: "src/types.ts:ID",
				type: "TypeAlias",
				name: "ID",
				module: "test",
				package: "main",
				filePath: "src/types.ts",
				startLine: 1,
				endLine: 1,
				exported: true,
				aliasedType: "string | number",
			},
			nodes: [],
			edges: [],
		};

		const output = formatNeighbors(result, 1, "both");

		expect(output).toContain("centerType: TypeAlias");
		expect(output).toContain("aliasedType: string | number");
	});

	it("formats variable with const and type info", () => {
		const result: NeighborResult = {
			center: {
				id: "src/config.ts:API_URL",
				type: "Variable",
				name: "API_URL",
				module: "test",
				package: "main",
				filePath: "src/config.ts",
				startLine: 5,
				endLine: 5,
				exported: true,
				isConst: true,
				variableType: "string",
			},
			nodes: [],
			edges: [],
		};

		const output = formatNeighbors(result, 1, "both");

		expect(output).toContain("centerType: Variable");
		expect(output).toContain("const: true");
		expect(output).toContain("type: string");
	});
});
