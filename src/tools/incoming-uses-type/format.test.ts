import { describe, expect, it } from "vitest";
import type { Node } from "../../db/Types.js";
import {
	IMPLICIT_MODULE_NAME,
	IMPLICIT_PACKAGE_NAME,
} from "../shared/nodeFormatters.js";
import type { SymbolLocation } from "../shared/resolveSymbol.js";
import { formatTypeUsages } from "./format.js";
import type { UsageWithEdge } from "./query.js";

/**
 * Helper to create a test SymbolLocation
 */
function createTarget(
	name = "User",
	file = "src/types/User.ts",
	module = "shared",
	packageName = "types",
): SymbolLocation {
	return {
		name,
		type: "Interface",
		file,
		offset: 1,
		limit: 15,
		module,
		package: packageName,
		id: `${file}:${name}`,
	};
}

/**
 * Helper to create UsageWithEdge test data
 */
function createUsage(
	name: string,
	type: string,
	filePath: string,
	module: string,
	packageName: string,
	context?: "parameter" | "return" | "property" | "variable",
): UsageWithEdge {
	return {
		node: {
			id: `${filePath}:${name}`,
			type: type as Node["type"],
			name,
			module,
			package: packageName,
			filePath,
			startLine: 10,
			endLine: 15,
			exported: true,
		},
		edge: {
			source: `${filePath}:${name}`,
			target: "src/types/User.ts:User",
			type: "USES_TYPE",
			context,
		},
	};
}

describe(formatTypeUsages.name, () => {
	it("formats empty usages list", () => {
		const target = createTarget();
		const result = formatTypeUsages(target, []);

		expect(result).toContain("type: User");
		expect(result).toContain("file: src/types/User.ts");
		expect(result).toContain("offset: 1");
		expect(result).toContain("limit: 15");
		expect(result).toContain("module: shared");
		expect(result).toContain("package: types");
		expect(result).toContain("used by (0 symbols across 0 packages):");
		expect(result).toContain("(no usages found)");
	});

	it("formats single usage", () => {
		const target = createTarget();
		const usages: UsageWithEdge[] = [
			createUsage(
				"handleCreateUser",
				"Function",
				"src/api/handler.ts",
				"backend",
				"api",
				"parameter",
			),
		];

		const result = formatTypeUsages(target, usages);
		expect(result).toContain("used by (1 symbols across 1 packages):");
		expect(result).toContain("api:");
		expect(result).toContain("- handleCreateUser (parameter)");
		expect(result).toContain("offset: 10, limit: 6");
	});

	it("groups usages by package", () => {
		const target = createTarget();
		const usages: UsageWithEdge[] = [
			createUsage(
				"handleCreateUser",
				"Function",
				"src/api/handler.ts",
				"backend",
				"api",
				"parameter",
			),
			createUsage(
				"createUserService",
				"Function",
				"src/services/userService.ts",
				"backend",
				"services",
				"parameter",
			),
			createUsage(
				"UserCard",
				"Class",
				"src/ui/UserCard.tsx",
				"frontend",
				"ui",
				"property",
			),
		];

		const result = formatTypeUsages(target, usages);
		expect(result).toContain("used by (3 symbols across 3 packages):");
		expect(result).toContain("api:");
		expect(result).toContain("services:");
		expect(result).toContain("ui:");
	});

	it("sorts packages alphabetically", () => {
		const target = createTarget();
		const usages: UsageWithEdge[] = [
			createUsage("z", "Function", "src/z.ts", "z", "z-package"),
			createUsage("a", "Function", "src/a.ts", "a", "a-package"),
			createUsage("m", "Function", "src/m.ts", "m", "m-package"),
		];

		const result = formatTypeUsages(target, usages);

		const aIndex = result.indexOf("a-package:");
		const mIndex = result.indexOf("m-package:");
		const zIndex = result.indexOf("z-package:");

		expect(aIndex).toBeLessThan(mIndex);
		expect(mIndex).toBeLessThan(zIndex);
	});

	it("formats usage with parameter context", () => {
		const target = createTarget();
		const usages: UsageWithEdge[] = [
			createUsage(
				"handleGetUser",
				"Function",
				"src/api/handler.ts",
				"backend",
				"api",
				"parameter",
			),
		];

		const result = formatTypeUsages(target, usages);
		expect(result).toContain("- handleGetUser (parameter)");
	});

	it("formats usage with return context", () => {
		const target = createTarget();
		const usages: UsageWithEdge[] = [
			createUsage(
				"getUserById",
				"Function",
				"src/services/userService.ts",
				"backend",
				"services",
				"return",
			),
		];

		const result = formatTypeUsages(target, usages);
		expect(result).toContain("- getUserById (return)");
	});

	it("formats usage with property context", () => {
		const target = createTarget();
		const usages: UsageWithEdge[] = [
			createUsage(
				"UserStore",
				"Class",
				"src/store/UserStore.ts",
				"frontend",
				"store",
				"property",
			),
		];

		const result = formatTypeUsages(target, usages);
		expect(result).toContain("- UserStore (property)");
	});

	it("formats usage with variable context", () => {
		const target = createTarget();
		const usages: UsageWithEdge[] = [
			createUsage(
				"currentUser",
				"Variable",
				"src/app/context.ts",
				"frontend",
				"app",
				"variable",
			),
		];

		const result = formatTypeUsages(target, usages);
		expect(result).toContain("- currentUser (variable)");
	});

	it("formats usage without context", () => {
		const target = createTarget();
		const usages: UsageWithEdge[] = [
			createUsage(
				"processUser",
				"Function",
				"src/utils/process.ts",
				"shared",
				"utils",
				undefined,
			),
		];

		const result = formatTypeUsages(target, usages);
		// Should not have parentheses if no context
		expect(result).toContain("- processUser");
		expect(result).not.toContain("- processUser ()");
	});

	it("shows total count of usages and packages", () => {
		const target = createTarget();
		const usages: UsageWithEdge[] = [
			createUsage("func1", "Function", "src/a.ts", "backend", "api"),
			createUsage("func2", "Function", "src/b.ts", "backend", "services"),
			createUsage("func3", "Function", "src/c.ts", "frontend", "ui"),
		];

		const result = formatTypeUsages(target, usages);
		expect(result).toContain("used by (3 symbols across 3 packages):");
	});

	describe("module/package omission", () => {
		it("omits module when IMPLICIT_MODULE_NAME", () => {
			const target = createTarget(
				"User",
				"src/types.ts",
				IMPLICIT_MODULE_NAME,
				"main",
			);
			const usages: UsageWithEdge[] = [
				createUsage(
					"handler",
					"Function",
					"src/api/handler.ts",
					"backend",
					"api",
					"parameter",
				),
			];

			const result = formatTypeUsages(target, usages);
			expect(result).not.toContain("module:");
			expect(result).toContain("package: main");
		});

		it("includes module when value is not 'default'", () => {
			const target = createTarget("User", "src/types.ts", "myModule", "main");
			const usages: UsageWithEdge[] = [
				createUsage(
					"handler",
					"Function",
					"src/api/handler.ts",
					"backend",
					"api",
					"parameter",
				),
			];

			const result = formatTypeUsages(target, usages);
			expect(result).toContain("module: myModule");
		});

		it("omits package when IMPLICIT_PACKAGE_NAME", () => {
			const target = createTarget(
				"User",
				"src/types.ts",
				"core",
				IMPLICIT_PACKAGE_NAME,
			);
			const usages: UsageWithEdge[] = [
				createUsage(
					"handler",
					"Function",
					"src/api/handler.ts",
					"backend",
					"api",
					"parameter",
				),
			];

			const result = formatTypeUsages(target, usages);
			expect(result).toContain("module: core");
			expect(result).not.toContain("package:");
		});

		it("includes package when value is not 'default'", () => {
			const target = createTarget("User", "src/types.ts", "core", "myPackage");
			const usages: UsageWithEdge[] = [
				createUsage(
					"handler",
					"Function",
					"src/api/handler.ts",
					"backend",
					"api",
					"parameter",
				),
			];

			const result = formatTypeUsages(target, usages);
			expect(result).toContain("package: myPackage");
		});

		it("omits both module and package when both are implicit defaults", () => {
			const target = createTarget(
				"User",
				"src/types.ts",
				IMPLICIT_MODULE_NAME,
				IMPLICIT_PACKAGE_NAME,
			);
			const usages: UsageWithEdge[] = [
				createUsage(
					"handler",
					"Function",
					"src/api/handler.ts",
					"backend",
					"api",
					"parameter",
				),
			];

			const result = formatTypeUsages(target, usages);
			expect(result).not.toContain("module:");
			expect(result).not.toContain("package:");
			expect(result).toContain("type: User");
			expect(result).toContain("file: src/types.ts");
		});
	});
});
