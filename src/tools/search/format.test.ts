import { describe, expect, it } from "vitest";
import type { Node } from "../../db/Types.js";
import { formatSearchResults } from "./format.js";

describe(formatSearchResults.name, () => {
	it("formats empty search results", () => {
		const result = formatSearchResults([]);
		expect(result).toContain("count: 0");
		expect(result).toContain("(no matches found)");
	});

	it("includes overall count and file count in header", () => {
		const nodes: Node[] = [
			{
				id: "src/a.ts:foo",
				type: "Function",
				name: "foo",
				module: "test",
				package: "main",
				filePath: "src/a.ts",
				startLine: 1,
				endLine: 5,
				exported: true,
			},
			{
				id: "src/b.ts:bar",
				type: "Function",
				name: "bar",
				module: "test",
				package: "main",
				filePath: "src/b.ts",
				startLine: 10,
				endLine: 15,
				exported: true,
			},
		];

		const result = formatSearchResults(nodes);
		expect(result).toContain("count: 2");
		expect(result).toContain("files: 2");
	});

	it("groups nodes by file", () => {
		const nodes: Node[] = [
			{
				id: "src/types.ts:User",
				type: "Interface",
				name: "User",
				module: "test",
				package: "main",
				filePath: "src/types.ts",
				startLine: 1,
				endLine: 5,
				exported: true,
			},
			{
				id: "src/utils.ts:formatDate",
				type: "Function",
				name: "formatDate",
				module: "test",
				package: "main",
				filePath: "src/utils.ts",
				startLine: 10,
				endLine: 15,
				exported: true,
			},
			{
				id: "src/types.ts:Role",
				type: "TypeAlias",
				name: "Role",
				module: "test",
				package: "main",
				filePath: "src/types.ts",
				startLine: 7,
				endLine: 7,
				exported: true,
			},
		];

		const result = formatSearchResults(nodes);

		// Should have two file sections
		expect(result).toContain("file: src/types.ts");
		expect(result).toContain("file: src/utils.ts");

		// src/types.ts should have 2 matches
		const typesIndex = result.indexOf("file: src/types.ts");
		const typesSection = result.slice(
			typesIndex,
			result.indexOf("file: src/utils.ts"),
		);
		expect(typesSection).toContain("matches: 2");

		// src/utils.ts should have 1 match
		const utilsIndex = result.indexOf("file: src/utils.ts");
		const utilsSection = result.slice(utilsIndex);
		expect(utilsSection).toContain("matches: 1");
	});

	it("includes module and package metadata for each file", () => {
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

		const result = formatSearchResults(nodes);
		expect(result).toContain("module: my-module");
		expect(result).toContain("package: my-package");
	});

	it("groups nodes by type within each file", () => {
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

		const result = formatSearchResults(nodes);

		// Should appear in type order: interfaces, then functions, then properties
		const interfaceIndex = result.indexOf("interfaces[");
		const functionIndex = result.indexOf("functions[");
		const propertyIndex = result.indexOf("properties[");

		expect(interfaceIndex).toBeLessThan(functionIndex);
		expect(functionIndex).toBeLessThan(propertyIndex);
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

		const result = formatSearchResults(nodes);
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

		const result = formatSearchResults(nodes);
		expect(result).toContain("interfaces[2]:");
		expect(result).toContain("BaseNode [24-51] exp");
		expect(result).toContain("FunctionNode [54-59] exp extends:[BaseNode]");
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

		const result = formatSearchResults(nodes);
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

		const result = formatSearchResults(nodes);
		expect(result).toContain("methods[1]:");
		expect(result).toContain(
			"User.save [20-25] private static async () → Promise<void>",
		);
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

		const result = formatSearchResults(nodes);
		expect(result).toContain("properties[2]:");
		expect(result).toContain("User.name [5]: string");
		expect(result).toContain("User.email? [6] ro: string");
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

		const result = formatSearchResults(nodes);
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

		const result = formatSearchResults(nodes);
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

		const result = formatSearchResults(nodes);
		expect(result).toContain("x [5]");
		expect(result).not.toContain("5-5");
	});

	it("handles complex generic types with commas in parameters", () => {
		// Edge case: generic types like Map<string, number> contain commas
		// The output format should preserve the full type string without ambiguity
		const nodes: Node[] = [
			{
				id: "src/test.ts:process",
				type: "Function",
				name: "process",
				module: "test",
				package: "main",
				filePath: "src/test.ts",
				startLine: 1,
				endLine: 5,
				exported: true,
				parameters: [
					{ name: "data", type: "Map<string, number>" },
					{ name: "count", type: "number" },
				],
				returnType: "void",
			},
		];

		const result = formatSearchResults(nodes);

		// Verify the complex generic type is preserved
		expect(result).toContain("data:Map<string, number>");
		expect(result).toContain("count:number");
		// The full signature should show both parameters
		expect(result).toContain("(data:Map<string, number>,count:number)");
	});

	it("output does not contain redundant type field in grouped sections", () => {
		// When nodes are grouped by type (functions[], interfaces[], etc.),
		// the 'type' field would be redundant - we verify it's not present
		const nodes: Node[] = [
			{
				id: "src/a.ts:foo",
				type: "Function",
				name: "foo",
				module: "test",
				package: "main",
				filePath: "src/a.ts",
				startLine: 1,
				endLine: 5,
				exported: true,
			},
			{
				id: "src/a.ts:bar",
				type: "Function",
				name: "bar",
				module: "test",
				package: "main",
				filePath: "src/a.ts",
				startLine: 10,
				endLine: 15,
				exported: true,
			},
		];

		const result = formatSearchResults(nodes);

		// The group header "functions[2]:" tells us the type
		expect(result).toContain("functions[2]:");

		// Should NOT contain explicit type field since it's derivable from group name
		// Pattern: "type: Function" or "type:Function" should not appear
		expect(result).not.toMatch(/\btype:\s*Function\b/);
		expect(result).not.toMatch(/\btype:\s*Class\b/);
		expect(result).not.toMatch(/\btype:\s*Interface\b/);
	});

	it("handles multiple files with different modules and packages", () => {
		const nodes: Node[] = [
			{
				id: "src/core/types.ts:User",
				type: "Interface",
				name: "User",
				module: "core",
				package: "main",
				filePath: "src/core/types.ts",
				startLine: 1,
				endLine: 5,
				exported: true,
			},
			{
				id: "src/utils/helpers.ts:formatUser",
				type: "Function",
				name: "formatUser",
				module: "utils",
				package: "helpers",
				filePath: "src/utils/helpers.ts",
				startLine: 10,
				endLine: 15,
				exported: true,
			},
		];

		const result = formatSearchResults(nodes);

		// Check first file
		expect(result).toContain("file: src/core/types.ts");
		const coreIndex = result.indexOf("file: src/core/types.ts");
		const coreSection = result.slice(
			coreIndex,
			result.indexOf("file: src/utils/helpers.ts"),
		);
		expect(coreSection).toContain("module: core");
		expect(coreSection).toContain("package: main");

		// Check second file
		expect(result).toContain("file: src/utils/helpers.ts");
		const utilsIndex = result.indexOf("file: src/utils/helpers.ts");
		const utilsSection = result.slice(utilsIndex);
		expect(utilsSection).toContain("module: utils");
		expect(utilsSection).toContain("package: helpers");
	});
});
