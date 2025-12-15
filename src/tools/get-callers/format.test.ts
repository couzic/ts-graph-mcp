import { describe, expect, it } from "vitest";
import type { Node } from "../../db/Types.js";
import { formatCallers } from "./format.js";

describe(formatCallers.name, () => {
	it("formats empty caller list", () => {
		const result = formatCallers("src/utils.ts:formatDate", []);
		expect(result).toContain("targetId: src/utils.ts:formatDate");
		expect(result).toContain("count: 0");
		expect(result).toContain("(no callers found)");
	});

	it("formats single caller function", () => {
		const nodes: Node[] = [
			{
				id: "src/api/handler.ts:handleRequest",
				type: "Function",
				name: "handleRequest",
				module: "my-module",
				package: "my-package",
				filePath: "src/api/handler.ts",
				startLine: 10,
				endLine: 25,
				exported: true,
				async: true,
				parameters: [{ name: "req", type: "Request" }],
				returnType: "Promise<Response>",
			},
		];

		const result = formatCallers("src/utils.ts:formatDate", nodes);
		expect(result).toContain("targetId: src/utils.ts:formatDate");
		expect(result).toContain("count: 1");
		expect(result).toContain("src/api/handler.ts (1 callers):");
		expect(result).toContain("functions[1]:");
		expect(result).toContain(
			"handleRequest [10-25] exp async (req:Request) → Promise<Response>",
		);
	});

	it("groups callers by file", () => {
		const nodes: Node[] = [
			{
				id: "src/api/handler.ts:handleRequest",
				type: "Function",
				name: "handleRequest",
				module: "api",
				package: "main",
				filePath: "src/api/handler.ts",
				startLine: 10,
				endLine: 15,
				exported: true,
			},
			{
				id: "src/services/UserService.ts:createUser",
				type: "Function",
				name: "createUser",
				module: "services",
				package: "main",
				filePath: "src/services/UserService.ts",
				startLine: 20,
				endLine: 30,
				exported: false,
			},
		];

		const result = formatCallers("src/db/user.ts:saveUser", nodes);
		expect(result).toContain("src/api/handler.ts (1 callers):");
		expect(result).toContain("src/services/UserService.ts (1 callers):");
	});

	it("groups callers by type within file", () => {
		const nodes: Node[] = [
			{
				id: "src/api/handler.ts:handleRequest",
				type: "Function",
				name: "handleRequest",
				module: "api",
				package: "main",
				filePath: "src/api/handler.ts",
				startLine: 10,
				endLine: 15,
				exported: true,
			},
			{
				id: "src/api/handler.ts:ApiClient.fetch",
				type: "Method",
				name: "fetch",
				module: "api",
				package: "main",
				filePath: "src/api/handler.ts",
				startLine: 40,
				endLine: 50,
				exported: false,
				visibility: "private",
				async: true,
			},
			{
				id: "src/api/handler.ts:validateInput",
				type: "Function",
				name: "validateInput",
				module: "api",
				package: "main",
				filePath: "src/api/handler.ts",
				startLine: 30,
				endLine: 35,
				exported: false,
			},
		];

		const result = formatCallers("src/utils.ts:formatDate", nodes);
		expect(result).toContain("src/api/handler.ts (3 callers):");
		expect(result).toContain("functions[2]:");
		expect(result).toContain("methods[1]:");

		// Functions should appear before methods
		const functionsIndex = result.indexOf("functions[2]:");
		const methodsIndex = result.indexOf("methods[1]:");
		expect(functionsIndex).toBeLessThan(methodsIndex);
	});

	it("formats method callers with visibility and static", () => {
		const nodes: Node[] = [
			{
				id: "src/user.ts:User.save",
				type: "Method",
				name: "save",
				module: "user",
				package: "main",
				filePath: "src/user.ts",
				startLine: 20,
				endLine: 25,
				exported: false,
				visibility: "private",
				static: true,
				async: true,
				parameters: [],
				returnType: "Promise<void>",
			},
		];

		const result = formatCallers("src/db/user.ts:saveUser", nodes);
		expect(result).toContain("methods[1]:");
		expect(result).toContain(
			"User.save [20-25] private static async () → Promise<void>",
		);
	});

	it("sorts files alphabetically", () => {
		const nodes: Node[] = [
			{
				id: "src/z.ts:funcZ",
				type: "Function",
				name: "funcZ",
				module: "test",
				package: "main",
				filePath: "src/z.ts",
				startLine: 1,
				endLine: 5,
				exported: false,
			},
			{
				id: "src/a.ts:funcA",
				type: "Function",
				name: "funcA",
				module: "test",
				package: "main",
				filePath: "src/a.ts",
				startLine: 1,
				endLine: 5,
				exported: false,
			},
		];

		const result = formatCallers("src/target.ts:myFunc", nodes);
		const aIndex = result.indexOf("src/a.ts");
		const zIndex = result.indexOf("src/z.ts");
		expect(aIndex).toBeLessThan(zIndex);
	});

	it("uses single line number when start equals end", () => {
		const nodes: Node[] = [
			{
				id: "src/test.ts:x",
				type: "Variable",
				name: "x",
				module: "test",
				package: "main",
				filePath: "src/test.ts",
				startLine: 5,
				endLine: 5,
				exported: false,
			},
		];

		const result = formatCallers("src/target.ts:myFunc", nodes);
		expect(result).toContain("x [5]");
		expect(result).not.toContain("5-5");
	});

	it("formats function parameters and return type", () => {
		const nodes: Node[] = [
			{
				id: "src/api.ts:makeRequest",
				type: "Function",
				name: "makeRequest",
				module: "api",
				package: "main",
				filePath: "src/api.ts",
				startLine: 10,
				endLine: 20,
				exported: true,
				async: false,
				parameters: [
					{ name: "url", type: "string" },
					{ name: "options", type: "RequestOptions" },
				],
				returnType: "Response",
			},
		];

		const result = formatCallers("src/http.ts:fetch", nodes);
		expect(result).toContain(
			"makeRequest [10-20] exp (url:string,options:RequestOptions) → Response",
		);
	});

	it("handles multiple callers per file with correct counts", () => {
		const nodes: Node[] = [
			{
				id: "src/file.ts:func1",
				type: "Function",
				name: "func1",
				module: "test",
				package: "main",
				filePath: "src/file.ts",
				startLine: 1,
				endLine: 5,
				exported: false,
			},
			{
				id: "src/file.ts:func2",
				type: "Function",
				name: "func2",
				module: "test",
				package: "main",
				filePath: "src/file.ts",
				startLine: 10,
				endLine: 15,
				exported: false,
			},
			{
				id: "src/file.ts:Class.method",
				type: "Method",
				name: "method",
				module: "test",
				package: "main",
				filePath: "src/file.ts",
				startLine: 20,
				endLine: 25,
				exported: false,
			},
		];

		const result = formatCallers("src/target.ts:myFunc", nodes);
		expect(result).toContain("count: 3");
		expect(result).toContain("src/file.ts (3 callers):");
		expect(result).toContain("functions[2]:");
		expect(result).toContain("methods[1]:");
	});
});
