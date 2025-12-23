import { describe, expect, it } from "vitest";
import type { EdgeType } from "../../db/Types.js";
import {
	IMPLICIT_MODULE_NAME,
	IMPLICIT_PACKAGE_NAME,
} from "../shared/nodeFormatters.js";
import type { SymbolLocation } from "../shared/resolveSymbol.js";
import { formatImpactNodes } from "./format.js";
import type { ImpactedNode } from "./query.js";

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

/**
 * Helper to create an ImpactedNode for testing.
 */
function createImpactedNode(
	name: string,
	depth: number,
	entryEdgeType: EdgeType,
	options: Partial<ImpactedNode> = {},
): ImpactedNode {
	return {
		id: `src/test.ts:${name}`,
		type: "Function",
		name,
		module: "test",
		package: "main",
		filePath: "src/test.ts",
		startLine: 1,
		endLine: 10,
		exported: true,
		depth,
		entryEdgeType,
		...options,
	};
}

describe(formatImpactNodes.name, () => {
	it("formats empty node list with summary", () => {
		const target = createSymbolLocation("src/types.ts:User");
		const result = formatImpactNodes(target, []);

		expect(result).toContain("target:");
		expect(result).toContain("name: User");
		expect(result).toContain("type: TypeAlias");
		expect(result).toContain("summary:");
		expect(result).toContain("total: 0 impacted across 0 files");
		expect(result).toContain("(no impacted code found)");
	});

	it("shows summary statistics", () => {
		const target = createSymbolLocation("src/types.ts:User");
		const nodes: ImpactedNode[] = [
			createImpactedNode("foo", 1, "CALLS"),
			createImpactedNode("bar", 2, "CALLS"),
			createImpactedNode("baz", 1, "USES_TYPE"),
		];

		const result = formatImpactNodes(target, nodes);

		expect(result).toContain("summary:");
		expect(result).toContain("total: 3 impacted across 1 files");
		expect(result).toContain("direct: 2");
		expect(result).toContain("transitive: 1");
		expect(result).toContain("max_depth: 2");
		expect(result).toContain("by_relationship:");
		expect(result).toContain("callers: 2 (1 direct)");
		expect(result).toContain("type_users: 1 (1 direct)");
	});

	it("groups nodes by relationship type", () => {
		const target = createSymbolLocation("src/types.ts:User");
		const nodes: ImpactedNode[] = [
			createImpactedNode("caller1", 1, "CALLS"),
			createImpactedNode("typeUser1", 1, "USES_TYPE"),
		];

		const result = formatImpactNodes(target, nodes);

		expect(result).toContain("callers[1]:");
		expect(result).toContain("type_users[1]:");
	});

	it("groups nodes by depth tier within relationship type", () => {
		const target = createSymbolLocation("src/types.ts:User");
		const nodes: ImpactedNode[] = [
			createImpactedNode("direct1", 1, "CALLS"),
			createImpactedNode("direct2", 1, "CALLS"),
			createImpactedNode("transitive1", 2, "CALLS"),
			createImpactedNode("transitive2", 3, "CALLS"),
		];

		const result = formatImpactNodes(target, nodes);

		expect(result).toContain("callers[4]:");
		expect(result).toContain("direct[2]:");
		expect(result).toContain("transitive[2]:");
	});

	it("groups nodes by file within depth tier", () => {
		const target = createSymbolLocation("src/types.ts:User");
		const nodes: ImpactedNode[] = [
			createImpactedNode("foo", 1, "CALLS", { filePath: "src/a.ts" }),
			createImpactedNode("bar", 1, "CALLS", { filePath: "src/b.ts" }),
		];

		const result = formatImpactNodes(target, nodes);

		expect(result).toContain("src/a.ts (1):");
		expect(result).toContain("src/b.ts (1):");
	});

	it("groups nodes by type within file", () => {
		const target = createSymbolLocation("src/types.ts:User");
		const nodes: ImpactedNode[] = [
			createImpactedNode("myFunc", 1, "CALLS", { type: "Function" }),
			createImpactedNode("MyClass", 1, "CALLS", {
				type: "Class",
				id: "src/test.ts:MyClass",
			}),
		];

		const result = formatImpactNodes(target, nodes);

		// Both types should appear under the same file
		expect(result).toContain("classes[1]:");
		expect(result).toContain("functions[1]:");
	});

	it("formats function nodes with parameters and return type", () => {
		const nodes: ImpactedNode[] = [
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
				depth: 1,
				entryEdgeType: "CALLS",
			},
		];

		const target = createSymbolLocation("src/types.ts:User");
		const result = formatImpactNodes(target, nodes);

		expect(result).toContain(
			"greet [10-15] exp async (name:string,age:number) → Promise<string>",
		);
	});

	it("formats interface nodes with extends", () => {
		const nodes: ImpactedNode[] = [
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
				depth: 1,
				entryEdgeType: "EXTENDS",
			},
		];

		const target = createSymbolLocation("src/types.ts:BaseNode");
		const result = formatImpactNodes(target, nodes);

		expect(result).toContain("extenders[1]:");
		expect(result).toContain("FunctionNode [54-59] exp extends:[BaseNode]");
	});

	it("formats method nodes with visibility and static", () => {
		const nodes: ImpactedNode[] = [
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
				depth: 1,
				entryEdgeType: "CALLS",
			},
		];

		const target = createSymbolLocation("src/types.ts:User");
		const result = formatImpactNodes(target, nodes);

		expect(result).toContain(
			"User.save [20-25] private static async () → Promise<void>",
		);
	});

	it("shows by_module only when multiple modules present", () => {
		const target = createSymbolLocation("src/types.ts:User");
		const nodes: ImpactedNode[] = [
			createImpactedNode("foo", 1, "CALLS", { module: "moduleA" }),
			createImpactedNode("bar", 1, "CALLS", { module: "moduleB" }),
		];

		const result = formatImpactNodes(target, nodes);

		expect(result).toContain("by_module:");
		expect(result).toContain("moduleA: 1");
		expect(result).toContain("moduleB: 1");
	});

	it("hides by_module when only one module present", () => {
		const target = createSymbolLocation("src/types.ts:User");
		const nodes: ImpactedNode[] = [
			createImpactedNode("foo", 1, "CALLS", { module: "singleModule" }),
			createImpactedNode("bar", 1, "CALLS", { module: "singleModule" }),
		];

		const result = formatImpactNodes(target, nodes);

		expect(result).not.toContain("by_module:");
	});

	it("sorts relationship types by count descending in summary", () => {
		const target = createSymbolLocation("src/types.ts:User");
		const nodes: ImpactedNode[] = [
			// 3 callers
			createImpactedNode("caller1", 1, "CALLS"),
			createImpactedNode("caller2", 1, "CALLS"),
			createImpactedNode("caller3", 2, "CALLS"),
			// 1 type user
			createImpactedNode("typeUser1", 1, "USES_TYPE"),
		];

		const result = formatImpactNodes(target, nodes);

		// callers should appear before type_users in summary
		const callersIndex = result.indexOf("callers: 3");
		const typeUsersIndex = result.indexOf("type_users: 1");
		expect(callersIndex).toBeLessThan(typeUsersIndex);
	});

	it("outputs offset and limit for Read tool", () => {
		const target = createSymbolLocation("src/types.ts:User");
		const nodes: ImpactedNode[] = [
			createImpactedNode("foo", 1, "CALLS", {
				startLine: 10,
				endLine: 20,
			}),
		];

		const result = formatImpactNodes(target, nodes);

		expect(result).toContain("offset: 10, limit: 11");
	});

	it("uses single line number when start equals end", () => {
		const nodes: ImpactedNode[] = [
			createImpactedNode("x", 1, "CALLS", {
				type: "Variable",
				startLine: 5,
				endLine: 5,
			}),
		];

		const target = createSymbolLocation("src/types.ts:User");
		const result = formatImpactNodes(target, nodes);

		expect(result).toContain("x [5]");
		expect(result).not.toContain("5-5");
	});

	it("orders relationship sections consistently", () => {
		const target = createSymbolLocation("src/types.ts:User");
		const nodes: ImpactedNode[] = [
			createImpactedNode("importer1", 1, "IMPORTS"),
			createImpactedNode("caller1", 1, "CALLS"),
			createImpactedNode("typeUser1", 1, "USES_TYPE"),
		];

		const result = formatImpactNodes(target, nodes);

		// Order should be: CALLS, USES_TYPE, IMPORTS (as defined in EDGE_TYPE_ORDER)
		const callersIndex = result.indexOf("callers[1]:");
		const typeUsersIndex = result.indexOf("type_users[1]:");
		const importersIndex = result.indexOf("importers[1]:");

		expect(callersIndex).toBeLessThan(typeUsersIndex);
		expect(typeUsersIndex).toBeLessThan(importersIndex);
	});

	it("handles EXTENDS relationship type", () => {
		const target = createSymbolLocation("src/types.ts:BaseClass");
		const nodes: ImpactedNode[] = [
			{
				id: "src/derived.ts:DerivedClass",
				type: "Class",
				name: "DerivedClass",
				module: "test",
				package: "main",
				filePath: "src/derived.ts",
				startLine: 1,
				endLine: 10,
				exported: true,
				extends: "BaseClass",
				depth: 1,
				entryEdgeType: "EXTENDS",
			},
		];

		const result = formatImpactNodes(target, nodes);

		expect(result).toContain("extenders[1]:");
		expect(result).toContain("DerivedClass [1-10] exp extends:BaseClass");
	});

	it("handles IMPLEMENTS relationship type", () => {
		const target = createSymbolLocation("src/types.ts:MyInterface");
		const nodes: ImpactedNode[] = [
			{
				id: "src/impl.ts:MyClass",
				type: "Class",
				name: "MyClass",
				module: "test",
				package: "main",
				filePath: "src/impl.ts",
				startLine: 1,
				endLine: 10,
				exported: true,
				implements: ["MyInterface"],
				depth: 1,
				entryEdgeType: "IMPLEMENTS",
			},
		];

		const result = formatImpactNodes(target, nodes);

		expect(result).toContain("implementers[1]:");
		expect(result).toContain("MyClass [1-10] exp implements:[MyInterface]");
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
			const nodes: ImpactedNode[] = [createImpactedNode("caller", 1, "CALLS")];

			const result = formatImpactNodes(target, nodes);

			expect(result).not.toContain("module:");
			expect(result).toContain("package: main");
		});

		it("includes module when value is not IMPLICIT_MODULE_NAME", () => {
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
			const nodes: ImpactedNode[] = [createImpactedNode("caller", 1, "CALLS")];

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
			const nodes: ImpactedNode[] = [createImpactedNode("caller", 1, "CALLS")];

			const result = formatImpactNodes(target, nodes);

			expect(result).toContain("module: core");
			expect(result).not.toContain("package:");
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
			const nodes: ImpactedNode[] = [createImpactedNode("caller", 1, "CALLS")];

			const result = formatImpactNodes(target, nodes);

			expect(result).not.toContain("module:");
			expect(result).not.toContain("package:");
			expect(result).toContain("target:");
			expect(result).toContain("name: formatDate");
		});
	});

	describe("complex scenarios", () => {
		it("formats multi-file multi-module impact", () => {
			const target = createSymbolLocation("src/core/types.ts:User");
			const nodes: ImpactedNode[] = [
				// Direct callers from different files and modules
				createImpactedNode("handleUser", 1, "CALLS", {
					filePath: "src/api/handler.ts",
					module: "api",
				}),
				createImpactedNode("validateUser", 1, "CALLS", {
					filePath: "src/core/validation.ts",
					module: "core",
				}),
				// Transitive callers
				createImpactedNode("processRequest", 2, "CALLS", {
					filePath: "src/api/router.ts",
					module: "api",
				}),
				// Type users
				createImpactedNode("UserService", 1, "USES_TYPE", {
					filePath: "src/services/user.ts",
					module: "services",
					type: "Class",
				}),
			];

			const result = formatImpactNodes(target, nodes);

			// Summary checks
			expect(result).toContain("total: 4 impacted across 4 files");
			expect(result).toContain("direct: 3");
			expect(result).toContain("transitive: 1");
			expect(result).toContain("max_depth: 2");

			// by_module should appear (multiple modules)
			expect(result).toContain("by_module:");
			expect(result).toContain("api: 2");
			expect(result).toContain("core: 1");
			expect(result).toContain("services: 1");

			// Relationship sections
			expect(result).toContain("callers[3]:");
			expect(result).toContain("type_users[1]:");
		});
	});
});
