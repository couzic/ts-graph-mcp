import { describe, expect, it } from "vitest";
import type { Node } from "../../../db/Types.js";
import { formatFileSymbols } from "./format.js";

describe(formatFileSymbols.name, () => {
	it("formats empty node list", () => {
		const result = formatFileSymbols("src/empty.ts", []);
		expect(result).toContain("filePath: src/empty.ts");
		expect(result).toContain("count: 0");
		expect(result).toContain("(no symbols found)");
	});

	it("hoists module and package metadata", () => {
		const nodes: Node[] = [
			{
				id: "src/test.ts:foo",
				type: "Function",
				name: "foo",
				module: "my-module",
				package: "my-package",
				filePath: "src/test.ts",
				startLine: 1,
				endLine: 5,
				exported: true,
			},
		];

		const result = formatFileSymbols("src/test.ts", nodes);
		expect(result).toContain("module: my-module");
		expect(result).toContain("package: my-package");
		expect(result).toContain("filePath: src/test.ts");
	});

	it("formats function nodes with parameters and return type", () => {
		const nodes: Node[] = [
			{
				id: "src/test.ts:greet",
				type: "Function",
				name: "greet",
				module: "test",
				package: "main",
				filePath: "src/test.ts",
				startLine: 10,
				endLine: 15,
				exported: true,
				async: true,
				parameters: [
					{ name: "name", type: "string" },
					{ name: "age", type: "number" },
				],
				returnType: "Promise<string>",
			},
		];

		const result = formatFileSymbols("src/test.ts", nodes);
		expect(result).toContain("functions[1]:");
		expect(result).toContain(
			"greet [10-15] exp async (name:string,age:number) → Promise<string>",
		);
	});

	it("formats interface nodes with extends", () => {
		const nodes: Node[] = [
			{
				id: "src/types.ts:BaseNode",
				type: "Interface",
				name: "BaseNode",
				module: "test",
				package: "main",
				filePath: "src/types.ts",
				startLine: 24,
				endLine: 51,
				exported: true,
			},
			{
				id: "src/types.ts:FunctionNode",
				type: "Interface",
				name: "FunctionNode",
				module: "test",
				package: "main",
				filePath: "src/types.ts",
				startLine: 54,
				endLine: 59,
				exported: true,
				extends: ["BaseNode"],
			},
		];

		const result = formatFileSymbols("src/types.ts", nodes);
		expect(result).toContain("interfaces[2]:");
		expect(result).toContain("BaseNode [24-51] exp");
		expect(result).toContain("FunctionNode [54-59] exp extends:[BaseNode]");
	});

	it("formats property nodes with type and optional marker", () => {
		const nodes: Node[] = [
			{
				id: "src/types.ts:User.name",
				type: "Property",
				name: "name",
				module: "test",
				package: "main",
				filePath: "src/types.ts",
				startLine: 5,
				endLine: 5,
				exported: false,
				propertyType: "string",
				optional: false,
				readonly: false,
			},
			{
				id: "src/types.ts:User.email",
				type: "Property",
				name: "email",
				module: "test",
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

		const result = formatFileSymbols("src/types.ts", nodes);
		expect(result).toContain("properties[2]:");
		expect(result).toContain("User.name [5]: string");
		expect(result).toContain("User.email? [6] ro: string");
	});

	it("formats class nodes with extends and implements", () => {
		const nodes: Node[] = [
			{
				id: "src/user.ts:User",
				type: "Class",
				name: "User",
				module: "test",
				package: "main",
				filePath: "src/user.ts",
				startLine: 10,
				endLine: 50,
				exported: true,
				extends: "BaseEntity",
				implements: ["Serializable", "Comparable"],
			},
		];

		const result = formatFileSymbols("src/user.ts", nodes);
		expect(result).toContain("classes[1]:");
		expect(result).toContain(
			"User [10-50] exp extends:BaseEntity implements:[Serializable,Comparable]",
		);
	});

	it("formats method nodes with visibility and static", () => {
		const nodes: Node[] = [
			{
				id: "src/user.ts:User.save",
				type: "Method",
				name: "save",
				module: "test",
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

		const result = formatFileSymbols("src/user.ts", nodes);
		expect(result).toContain("methods[1]:");
		expect(result).toContain(
			"User.save [20-25] private static async () → Promise<void>",
		);
	});

	it("formats type alias nodes", () => {
		const nodes: Node[] = [
			{
				id: "src/types.ts:UserId",
				type: "TypeAlias",
				name: "UserId",
				module: "test",
				package: "main",
				filePath: "src/types.ts",
				startLine: 1,
				endLine: 1,
				exported: true,
				aliasedType: "string | number",
			},
		];

		const result = formatFileSymbols("src/types.ts", nodes);
		expect(result).toContain("typeAliases[1]:");
		expect(result).toContain("UserId [1] exp = string | number");
	});

	it("formats variable nodes with const marker", () => {
		const nodes: Node[] = [
			{
				id: "src/config.ts:API_URL",
				type: "Variable",
				name: "API_URL",
				module: "test",
				package: "main",
				filePath: "src/config.ts",
				startLine: 1,
				endLine: 1,
				exported: true,
				isConst: true,
				variableType: "string",
			},
		];

		const result = formatFileSymbols("src/config.ts", nodes);
		expect(result).toContain("variables[1]:");
		expect(result).toContain("API_URL [1] exp const: string");
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

		const result = formatFileSymbols("src/test.ts", nodes);
		expect(result).toContain("x [5]");
		expect(result).not.toContain("5-5");
	});

	it("groups nodes by type in consistent order", () => {
		const nodes: Node[] = [
			{
				id: "src/test.ts:prop",
				type: "Property",
				name: "prop",
				module: "test",
				package: "main",
				filePath: "src/test.ts",
				startLine: 1,
				endLine: 1,
				exported: false,
			},
			{
				id: "src/test.ts:MyInterface",
				type: "Interface",
				name: "MyInterface",
				module: "test",
				package: "main",
				filePath: "src/test.ts",
				startLine: 3,
				endLine: 5,
				exported: true,
			},
			{
				id: "src/test.ts:myFunc",
				type: "Function",
				name: "myFunc",
				module: "test",
				package: "main",
				filePath: "src/test.ts",
				startLine: 7,
				endLine: 10,
				exported: true,
			},
		];

		const result = formatFileSymbols("src/test.ts", nodes);
		const interfaceIndex = result.indexOf("interfaces[");
		const functionIndex = result.indexOf("functions[");
		const propertyIndex = result.indexOf("properties[");

		// Interfaces should come before functions, functions before properties
		expect(interfaceIndex).toBeLessThan(functionIndex);
		expect(functionIndex).toBeLessThan(propertyIndex);
	});
});
