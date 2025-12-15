import { describe, expect, it } from "vitest";
import type { Node } from "../../db/Types.js";
import { formatCallees } from "./format.js";

describe(formatCallees.name, () => {
	it("formats empty node list", () => {
		const result = formatCallees("src/test.ts:foo", []);
		expect(result).toContain("sourceId: src/test.ts:foo");
		expect(result).toContain("count: 0");
		expect(result).toContain("(no callees found)");
	});

	it("formats single function callee", () => {
		const nodes: Node[] = [
			{
				id: "src/utils.ts:helper",
				type: "Function",
				name: "helper",
				module: "core",
				package: "main",
				filePath: "src/utils.ts",
				startLine: 10,
				endLine: 15,
				exported: true,
				parameters: [{ name: "x", type: "number" }],
				returnType: "string",
			},
		];

		const result = formatCallees("src/main.ts:run", nodes);
		expect(result).toContain("sourceId: src/main.ts:run");
		expect(result).toContain("count: 1");
		expect(result).toContain(
			"=== src/utils.ts (module: core, package: main) ===",
		);
		expect(result).toContain("functions[1]:");
		expect(result).toContain("helper [10-15] exp (x:number) → string");
	});

	it("groups callees by file", () => {
		const nodes: Node[] = [
			{
				id: "src/db/user.ts:saveUser",
				type: "Function",
				name: "saveUser",
				module: "core",
				package: "main",
				filePath: "src/db/user.ts",
				startLine: 10,
				endLine: 15,
				exported: true,
			},
			{
				id: "src/utils/logger.ts:logInfo",
				type: "Function",
				name: "logInfo",
				module: "core",
				package: "main",
				filePath: "src/utils/logger.ts",
				startLine: 5,
				endLine: 7,
				exported: true,
			},
			{
				id: "src/db/user.ts:validateUser",
				type: "Function",
				name: "validateUser",
				module: "core",
				package: "main",
				filePath: "src/db/user.ts",
				startLine: 20,
				endLine: 25,
				exported: false,
			},
		];

		const result = formatCallees("src/api/handler.ts:createUser", nodes);
		expect(result).toContain("count: 3");

		// Check file headers exist
		expect(result).toContain("=== src/db/user.ts");
		expect(result).toContain("=== src/utils/logger.ts");

		// Check functions are grouped by file
		const dbUserIndex = result.indexOf("=== src/db/user.ts");
		const loggerIndex = result.indexOf("=== src/utils/logger.ts");

		expect(result.indexOf("saveUser", dbUserIndex)).toBeLessThan(loggerIndex);
		expect(result.indexOf("validateUser", dbUserIndex)).toBeLessThan(
			loggerIndex,
		);
		expect(result.indexOf("logInfo", loggerIndex)).toBeGreaterThan(dbUserIndex);
	});

	it("groups nodes by type within each file", () => {
		const nodes: Node[] = [
			{
				id: "src/test.ts:MyClass",
				type: "Class",
				name: "MyClass",
				module: "test",
				package: "main",
				filePath: "src/test.ts",
				startLine: 10,
				endLine: 20,
				exported: true,
			},
			{
				id: "src/test.ts:myFunc",
				type: "Function",
				name: "myFunc",
				module: "test",
				package: "main",
				filePath: "src/test.ts",
				startLine: 5,
				endLine: 7,
				exported: true,
			},
			{
				id: "src/test.ts:MyInterface",
				type: "Interface",
				name: "MyInterface",
				module: "test",
				package: "main",
				filePath: "src/test.ts",
				startLine: 1,
				endLine: 3,
				exported: true,
			},
		];

		const result = formatCallees("src/main.ts:main", nodes);

		// Interfaces come before classes, classes before functions
		const interfaceIndex = result.indexOf("interfaces[");
		const classIndex = result.indexOf("classes[");
		const functionIndex = result.indexOf("functions[");

		expect(interfaceIndex).toBeLessThan(classIndex);
		expect(classIndex).toBeLessThan(functionIndex);
	});

	it("formats function with async and parameters", () => {
		const nodes: Node[] = [
			{
				id: "src/api.ts:fetchData",
				type: "Function",
				name: "fetchData",
				module: "core",
				package: "main",
				filePath: "src/api.ts",
				startLine: 10,
				endLine: 20,
				exported: true,
				async: true,
				parameters: [
					{ name: "url", type: "string" },
					{ name: "opts", type: "RequestOptions" },
				],
				returnType: "Promise<Data>",
			},
		];

		const result = formatCallees("src/main.ts:main", nodes);
		expect(result).toContain(
			"fetchData [10-20] exp async (url:string,opts:RequestOptions) → Promise<Data>",
		);
	});

	it("formats method with visibility and static", () => {
		const nodes: Node[] = [
			{
				id: "src/user.ts:User.save",
				type: "Method",
				name: "save",
				module: "core",
				package: "main",
				filePath: "src/user.ts",
				startLine: 15,
				endLine: 20,
				exported: false,
				visibility: "private",
				static: true,
				async: true,
				parameters: [],
				returnType: "Promise<void>",
			},
		];

		const result = formatCallees("src/api.ts:createUser", nodes);
		expect(result).toContain(
			"User.save [15-20] private static async () → Promise<void>",
		);
	});

	it("formats class with extends and implements", () => {
		const nodes: Node[] = [
			{
				id: "src/models/User.ts:User",
				type: "Class",
				name: "User",
				module: "core",
				package: "main",
				filePath: "src/models/User.ts",
				startLine: 10,
				endLine: 50,
				exported: true,
				extends: "BaseEntity",
				implements: ["Serializable", "Comparable"],
			},
		];

		const result = formatCallees("src/main.ts:main", nodes);
		expect(result).toContain(
			"User [10-50] exp extends:BaseEntity implements:[Serializable,Comparable]",
		);
	});

	it("formats interface with extends", () => {
		const nodes: Node[] = [
			{
				id: "src/types.ts:FunctionNode",
				type: "Interface",
				name: "FunctionNode",
				module: "core",
				package: "main",
				filePath: "src/types.ts",
				startLine: 54,
				endLine: 59,
				exported: true,
				extends: ["BaseNode"],
			},
		];

		const result = formatCallees("src/main.ts:main", nodes);
		expect(result).toContain("FunctionNode [54-59] exp extends:[BaseNode]");
	});

	it("formats type alias", () => {
		const nodes: Node[] = [
			{
				id: "src/types.ts:UserId",
				type: "TypeAlias",
				name: "UserId",
				module: "core",
				package: "main",
				filePath: "src/types.ts",
				startLine: 1,
				endLine: 1,
				exported: true,
				aliasedType: "string | number",
			},
		];

		const result = formatCallees("src/main.ts:main", nodes);
		expect(result).toContain("UserId [1] exp = string | number");
	});

	it("formats variable with const marker", () => {
		const nodes: Node[] = [
			{
				id: "src/config.ts:API_URL",
				type: "Variable",
				name: "API_URL",
				module: "core",
				package: "main",
				filePath: "src/config.ts",
				startLine: 1,
				endLine: 1,
				exported: true,
				isConst: true,
				variableType: "string",
			},
		];

		const result = formatCallees("src/main.ts:main", nodes);
		expect(result).toContain("API_URL [1] exp const: string");
	});

	it("formats property with optional and readonly", () => {
		const nodes: Node[] = [
			{
				id: "src/types.ts:User.email",
				type: "Property",
				name: "email",
				module: "core",
				package: "main",
				filePath: "src/types.ts",
				startLine: 6,
				endLine: 6,
				exported: false,
				propertyType: "string",
				optional: true,
				readonly: true,
			},
		];

		const result = formatCallees("src/main.ts:main", nodes);
		expect(result).toContain("User.email? [6] ro: string");
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

		const result = formatCallees("src/main.ts:main", nodes);
		expect(result).toContain("x [5]");
		expect(result).not.toContain("5-5");
	});

	it("sorts files alphabetically", () => {
		const nodes: Node[] = [
			{
				id: "src/z.ts:zFunc",
				type: "Function",
				name: "zFunc",
				module: "core",
				package: "main",
				filePath: "src/z.ts",
				startLine: 1,
				endLine: 1,
				exported: true,
			},
			{
				id: "src/a.ts:aFunc",
				type: "Function",
				name: "aFunc",
				module: "core",
				package: "main",
				filePath: "src/a.ts",
				startLine: 1,
				endLine: 1,
				exported: true,
			},
			{
				id: "src/m.ts:mFunc",
				type: "Function",
				name: "mFunc",
				module: "core",
				package: "main",
				filePath: "src/m.ts",
				startLine: 1,
				endLine: 1,
				exported: true,
			},
		];

		const result = formatCallees("src/main.ts:main", nodes);

		const aIndex = result.indexOf("=== src/a.ts");
		const mIndex = result.indexOf("=== src/m.ts");
		const zIndex = result.indexOf("=== src/z.ts");

		expect(aIndex).toBeLessThan(mIndex);
		expect(mIndex).toBeLessThan(zIndex);
	});

	it("handles multiple types in same file", () => {
		const nodes: Node[] = [
			{
				id: "src/user.ts:User",
				type: "Class",
				name: "User",
				module: "core",
				package: "main",
				filePath: "src/user.ts",
				startLine: 10,
				endLine: 30,
				exported: true,
			},
			{
				id: "src/user.ts:User.save",
				type: "Method",
				name: "save",
				module: "core",
				package: "main",
				filePath: "src/user.ts",
				startLine: 15,
				endLine: 20,
				exported: false,
			},
			{
				id: "src/user.ts:createUser",
				type: "Function",
				name: "createUser",
				module: "core",
				package: "main",
				filePath: "src/user.ts",
				startLine: 5,
				endLine: 8,
				exported: true,
			},
		];

		const result = formatCallees("src/main.ts:main", nodes);

		// Should only have one file header
		const matches = result.match(/=== src\/user\.ts/g);
		expect(matches).toHaveLength(1);

		// Should have all three type sections
		expect(result).toContain("classes[1]:");
		expect(result).toContain("functions[1]:");
		expect(result).toContain("methods[1]:");
	});
});
