import { describe, expect, it } from "vitest";
import type { Node } from "../../db/Types.js";
import {
	IMPLICIT_MODULE_NAME,
	IMPLICIT_PACKAGE_NAME,
} from "../shared/nodeFormatters.js";
import type { SymbolLocation } from "../shared/resolveSymbol.js";
import { formatImpactNodes } from "./format.js";

/**
 * Helper to create a SymbolLocation for testing.
 */
function createSymbolLocation(
	id: string,
	type = "TypeAlias",
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

describe(formatImpactNodes.name, () => {
	it("formats empty node list", () => {
		const target = createSymbolLocation("src/types.ts:User");
		const result = formatImpactNodes(target, []);
		expect(result).toContain("target:");
		expect(result).toContain("name: User");
		expect(result).toContain("type: TypeAlias");
		expect(result).toContain("file: src/test.ts");
		expect(result).toContain("impacted[0]:");
		expect(result).toContain("(no impacted code found)");
	});

	it("groups nodes by file", () => {
		const target = createSymbolLocation("src/types.ts:User");
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

		const result = formatImpactNodes(target, nodes);
		expect(result).toContain("target:");
		expect(result).toContain("name: User");
		expect(result).toContain("src/a.ts (1 impacted):");
		expect(result).toContain("src/b.ts (1 impacted):");
	});

	it("groups nodes by type within each file", () => {
		const target = createSymbolLocation("src/types.ts:User");
		const nodes: Node[] = [
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
			{
				id: "src/test.ts:myFunc",
				type: "Function",
				name: "myFunc",
				module: "test",
				package: "main",
				filePath: "src/test.ts",
				startLine: 5,
				endLine: 10,
				exported: true,
			},
			{
				id: "src/test.ts:MyClass",
				type: "Class",
				name: "MyClass",
				module: "test",
				package: "main",
				filePath: "src/test.ts",
				startLine: 12,
				endLine: 20,
				exported: true,
			},
		];

		const result = formatImpactNodes(target, nodes);
		expect(result).toContain("src/test.ts (3 impacted):");
		expect(result).toContain("interfaces[1]:");
		expect(result).toContain("classes[1]:");
		expect(result).toContain("functions[1]:");

		// Check ordering: interfaces before classes, classes before functions
		const interfaceIndex = result.indexOf("interfaces[");
		const classIndex = result.indexOf("classes[");
		const functionIndex = result.indexOf("functions[");
		expect(interfaceIndex).toBeLessThan(classIndex);
		expect(interfaceIndex).toBeLessThan(functionIndex);
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

		const target = createSymbolLocation("src/types.ts:User");
		const result = formatImpactNodes(target, nodes);
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

		const target = createSymbolLocation("src/types.ts:User");
		const result = formatImpactNodes(target, nodes);
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

		const target = createSymbolLocation("src/types.ts:User");
		const result = formatImpactNodes(target, nodes);
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

		const target = createSymbolLocation("src/types.ts:Entity");
		const result = formatImpactNodes(target, nodes);
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

		const target = createSymbolLocation("src/types.ts:User");
		const result = formatImpactNodes(target, nodes);
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

		const target = createSymbolLocation("src/types.ts:User");
		const result = formatImpactNodes(target, nodes);
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

		const target = createSymbolLocation("src/types.ts:Config");
		const result = formatImpactNodes(target, nodes);
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

		const target = createSymbolLocation("src/types.ts:User");
		const result = formatImpactNodes(target, nodes);
		expect(result).toContain("x [5]");
		expect(result).not.toContain("5-5");
	});

	it("shows total count of nodes", () => {
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

		const target = createSymbolLocation("src/types.ts:User");
		const result = formatImpactNodes(target, nodes);
		expect(result).toContain("impacted[2]:");
	});

	it("shows per-file impacted counts", () => {
		const nodes: Node[] = [
			{
				id: "src/test.ts:foo",
				type: "Function",
				name: "foo",
				module: "test",
				package: "main",
				filePath: "src/test.ts",
				startLine: 1,
				endLine: 5,
				exported: true,
			},
			{
				id: "src/test.ts:bar",
				type: "Function",
				name: "bar",
				module: "test",
				package: "main",
				filePath: "src/test.ts",
				startLine: 10,
				endLine: 15,
				exported: true,
			},
			{
				id: "src/test.ts:MyClass",
				type: "Class",
				name: "MyClass",
				module: "test",
				package: "main",
				filePath: "src/test.ts",
				startLine: 20,
				endLine: 30,
				exported: true,
			},
		];

		const target = createSymbolLocation("src/types.ts:User");
		const result = formatImpactNodes(target, nodes);
		expect(result).toContain("src/test.ts (3 impacted):");
	});

	it("handles multiple files with mixed types", () => {
		const nodes: Node[] = [
			{
				id: "src/a.ts:Foo",
				type: "Interface",
				name: "Foo",
				module: "test",
				package: "main",
				filePath: "src/a.ts",
				startLine: 1,
				endLine: 3,
				exported: true,
			},
			{
				id: "src/a.ts:bar",
				type: "Function",
				name: "bar",
				module: "test",
				package: "main",
				filePath: "src/a.ts",
				startLine: 5,
				endLine: 10,
				exported: true,
			},
			{
				id: "src/b.ts:Baz",
				type: "Class",
				name: "Baz",
				module: "test",
				package: "main",
				filePath: "src/b.ts",
				startLine: 1,
				endLine: 20,
				exported: true,
			},
		];

		const target = createSymbolLocation("src/types.ts:User");
		const result = formatImpactNodes(target, nodes);

		// Check both files appear
		expect(result).toContain("src/a.ts (2 impacted):");
		expect(result).toContain("src/b.ts (1 impacted):");

		// Check types within files
		expect(result).toContain("interfaces[1]:");
		expect(result).toContain("functions[1]:");
		expect(result).toContain("classes[1]:");
	});

	describe("module/package omission", () => {
		it("omits module when IMPLICIT_MODULE_NAME", () => {
			const target: SymbolLocation = {
				id: "src/utils.ts:formatDate",
				name: "formatDate",
				type: "Function",
				file: "src/utils.ts",
				offset: 1,
				limit: 10,
				module: IMPLICIT_MODULE_NAME,
				package: "main",
			};
			const nodes: Node[] = [
				{
					id: "src/api/handler.ts:handleRequest",
					type: "Function",
					name: "handleRequest",
					module: "backend",
					package: "api",
					filePath: "src/api/handler.ts",
					startLine: 10,
					endLine: 15,
					exported: true,
				},
			];

			const result = formatImpactNodes(target, nodes);
			expect(result).not.toContain("module:");
			expect(result).toContain("package: main");
		});

		it("includes module when value is not 'default'", () => {
			const target: SymbolLocation = {
				id: "src/utils.ts:formatDate",
				name: "formatDate",
				type: "Function",
				file: "src/utils.ts",
				offset: 1,
				limit: 10,
				module: "myModule",
				package: "main",
			};
			const nodes: Node[] = [
				{
					id: "src/api/handler.ts:handleRequest",
					type: "Function",
					name: "handleRequest",
					module: "backend",
					package: "api",
					filePath: "src/api/handler.ts",
					startLine: 10,
					endLine: 15,
					exported: true,
				},
			];

			const result = formatImpactNodes(target, nodes);
			expect(result).toContain("module: myModule");
		});

		it("omits package when IMPLICIT_PACKAGE_NAME", () => {
			const target: SymbolLocation = {
				id: "src/utils.ts:formatDate",
				name: "formatDate",
				type: "Function",
				file: "src/utils.ts",
				offset: 1,
				limit: 10,
				module: "core",
				package: IMPLICIT_PACKAGE_NAME,
			};
			const nodes: Node[] = [
				{
					id: "src/api/handler.ts:handleRequest",
					type: "Function",
					name: "handleRequest",
					module: "backend",
					package: "api",
					filePath: "src/api/handler.ts",
					startLine: 10,
					endLine: 15,
					exported: true,
				},
			];

			const result = formatImpactNodes(target, nodes);
			expect(result).toContain("module: core");
			expect(result).not.toContain("package:");
		});

		it("includes package when value is not 'default'", () => {
			const target: SymbolLocation = {
				id: "src/utils.ts:formatDate",
				name: "formatDate",
				type: "Function",
				file: "src/utils.ts",
				offset: 1,
				limit: 10,
				module: "core",
				package: "myPackage",
			};
			const nodes: Node[] = [
				{
					id: "src/api/handler.ts:handleRequest",
					type: "Function",
					name: "handleRequest",
					module: "backend",
					package: "api",
					filePath: "src/api/handler.ts",
					startLine: 10,
					endLine: 15,
					exported: true,
				},
			];

			const result = formatImpactNodes(target, nodes);
			expect(result).toContain("package: myPackage");
		});

		it("omits both module and package when both are IMPLICIT values", () => {
			const target: SymbolLocation = {
				id: "src/utils.ts:formatDate",
				name: "formatDate",
				type: "Function",
				file: "src/utils.ts",
				offset: 1,
				limit: 10,
				module: IMPLICIT_MODULE_NAME,
				package: IMPLICIT_PACKAGE_NAME,
			};
			const nodes: Node[] = [
				{
					id: "src/api/handler.ts:handleRequest",
					type: "Function",
					name: "handleRequest",
					module: "backend",
					package: "api",
					filePath: "src/api/handler.ts",
					startLine: 10,
					endLine: 15,
					exported: true,
				},
			];

			const result = formatImpactNodes(target, nodes);
			expect(result).not.toContain("module:");
			expect(result).not.toContain("package:");
			expect(result).toContain("target:");
			expect(result).toContain("name: formatDate");
		});
	});
});
