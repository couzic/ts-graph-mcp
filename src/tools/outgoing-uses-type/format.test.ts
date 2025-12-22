import { describe, expect, it } from "vitest";
import type { Node } from "../../db/Types.js";
import {
	IMPLICIT_MODULE_NAME,
	IMPLICIT_PACKAGE_NAME,
} from "../shared/nodeFormatters.js";
import type { SymbolLocation } from "../shared/resolveSymbol.js";
import { formatTypeDependencies } from "./format.js";
import type { DependencyWithEdge } from "./query.js";

/**
 * Helper to create a test SymbolLocation
 */
function createSource(
	name = "createUser",
	type = "Function",
	file = "src/api/userRoutes.ts",
	module = "backend",
	packageName = "api",
): SymbolLocation {
	return {
		name,
		type,
		file,
		offset: 10,
		limit: 6,
		module,
		package: packageName,
		id: `${file}:${name}`,
	};
}

/**
 * Helper to create DependencyWithEdge test data
 */
function createDependency(
	name: string,
	type: string,
	filePath: string,
	module: string,
	packageName: string,
	context?: "parameter" | "return" | "property" | "variable",
): DependencyWithEdge {
	return {
		node: {
			id: `${filePath}:${name}`,
			type: type as Node["type"],
			name,
			module,
			package: packageName,
			filePath,
			startLine: 5,
			endLine: 15,
			exported: true,
		},
		edge: {
			source: "src/api/userRoutes.ts:createUser",
			target: `${filePath}:${name}`,
			type: "USES_TYPE",
			context,
		},
	};
}

describe(formatTypeDependencies.name, () => {
	it("formats empty dependencies list", () => {
		const source = createSource();
		const result = formatTypeDependencies(source, []);

		expect(result).toContain("source: createUser");
		expect(result).toContain("type: Function");
		expect(result).toContain("file: src/api/userRoutes.ts");
		expect(result).toContain("offset: 10");
		expect(result).toContain("limit: 6");
		expect(result).toContain("module: backend");
		expect(result).toContain("package: api");
		expect(result).toContain("references (0 types across 0 packages):");
		expect(result).toContain("(no type dependencies found)");
	});

	it("formats single dependency", () => {
		const source = createSource();
		const dependencies: DependencyWithEdge[] = [
			createDependency(
				"User",
				"Interface",
				"src/types/User.ts",
				"shared",
				"types",
				"parameter",
			),
		];

		const result = formatTypeDependencies(source, dependencies);
		expect(result).toContain("references (1 types across 1 packages):");
		expect(result).toContain("types:");
		expect(result).toContain("- User (parameter)");
		expect(result).toContain("offset: 5, limit: 11");
	});

	it("groups dependencies by package", () => {
		const source = createSource();
		const dependencies: DependencyWithEdge[] = [
			createDependency(
				"User",
				"Interface",
				"src/types/User.ts",
				"shared",
				"types",
				"parameter",
			),
			createDependency(
				"Config",
				"Interface",
				"src/types/Config.ts",
				"shared",
				"types",
				"return",
			),
			createDependency(
				"ValidationError",
				"Class",
				"src/errors/ValidationError.ts",
				"backend",
				"validation",
				"variable",
			),
		];

		const result = formatTypeDependencies(source, dependencies);
		expect(result).toContain("references (3 types across 2 packages):");
		expect(result).toContain("types:");
		expect(result).toContain("validation:");
	});

	it("sorts packages alphabetically", () => {
		const source = createSource();
		const dependencies: DependencyWithEdge[] = [
			createDependency("Z", "Interface", "src/z.ts", "z", "z-package"),
			createDependency("A", "Interface", "src/a.ts", "a", "a-package"),
			createDependency("M", "Interface", "src/m.ts", "m", "m-package"),
		];

		const result = formatTypeDependencies(source, dependencies);

		const aIndex = result.indexOf("a-package:");
		const mIndex = result.indexOf("m-package:");
		const zIndex = result.indexOf("z-package:");

		expect(aIndex).toBeLessThan(mIndex);
		expect(mIndex).toBeLessThan(zIndex);
	});

	it("formats dependency with parameter context", () => {
		const source = createSource();
		const dependencies: DependencyWithEdge[] = [
			createDependency(
				"User",
				"Interface",
				"src/types/User.ts",
				"shared",
				"types",
				"parameter",
			),
		];

		const result = formatTypeDependencies(source, dependencies);
		expect(result).toContain("- User (parameter)");
	});

	it("formats dependency with return context", () => {
		const source = createSource();
		const dependencies: DependencyWithEdge[] = [
			createDependency(
				"Response",
				"Interface",
				"src/types/Response.ts",
				"shared",
				"types",
				"return",
			),
		];

		const result = formatTypeDependencies(source, dependencies);
		expect(result).toContain("- Response (return)");
	});

	it("formats dependency with property context", () => {
		const source = createSource("UserStore", "Class");
		const dependencies: DependencyWithEdge[] = [
			createDependency(
				"User",
				"Interface",
				"src/types/User.ts",
				"shared",
				"types",
				"property",
			),
		];

		const result = formatTypeDependencies(source, dependencies);
		expect(result).toContain("- User (property)");
	});

	it("formats dependency with variable context", () => {
		const source = createSource();
		const dependencies: DependencyWithEdge[] = [
			createDependency(
				"Config",
				"Interface",
				"src/types/Config.ts",
				"shared",
				"types",
				"variable",
			),
		];

		const result = formatTypeDependencies(source, dependencies);
		expect(result).toContain("- Config (variable)");
	});

	it("formats dependency without context", () => {
		const source = createSource();
		const dependencies: DependencyWithEdge[] = [
			createDependency(
				"User",
				"Interface",
				"src/types/User.ts",
				"shared",
				"types",
				undefined,
			),
		];

		const result = formatTypeDependencies(source, dependencies);
		// Should not have parentheses if no context
		expect(result).toContain("- User");
		expect(result).not.toContain("- User ()");
	});

	it("shows total count of dependencies and packages", () => {
		const source = createSource();
		const dependencies: DependencyWithEdge[] = [
			createDependency("User", "Interface", "src/a.ts", "shared", "types"),
			createDependency("Config", "Interface", "src/b.ts", "shared", "types"),
			createDependency(
				"ValidationError",
				"Class",
				"src/c.ts",
				"backend",
				"validation",
			),
		];

		const result = formatTypeDependencies(source, dependencies);
		expect(result).toContain("references (3 types across 2 packages):");
	});

	describe("module/package omission", () => {
		it("omits module when value is implicit default", () => {
			const source = createSource(
				"handler",
				"Function",
				"src/api.ts",
				IMPLICIT_MODULE_NAME,
				"main",
			);
			const dependencies: DependencyWithEdge[] = [
				createDependency(
					"User",
					"Interface",
					"src/types/User.ts",
					"shared",
					"types",
					"parameter",
				),
			];

			const result = formatTypeDependencies(source, dependencies);
			expect(result).not.toContain("module:");
			expect(result).toContain("package: main");
		});

		it("includes module when value is not 'default'", () => {
			const source = createSource(
				"handler",
				"Function",
				"src/api.ts",
				"myModule",
				"main",
			);
			const dependencies: DependencyWithEdge[] = [
				createDependency(
					"User",
					"Interface",
					"src/types/User.ts",
					"shared",
					"types",
					"parameter",
				),
			];

			const result = formatTypeDependencies(source, dependencies);
			expect(result).toContain("module: myModule");
		});

		it("omits package when value is implicit default", () => {
			const source = createSource(
				"handler",
				"Function",
				"src/api.ts",
				"core",
				IMPLICIT_PACKAGE_NAME,
			);
			const dependencies: DependencyWithEdge[] = [
				createDependency(
					"User",
					"Interface",
					"src/types/User.ts",
					"shared",
					"types",
					"parameter",
				),
			];

			const result = formatTypeDependencies(source, dependencies);
			expect(result).toContain("module: core");
			expect(result).not.toContain("package:");
		});

		it("includes package when value is not 'default'", () => {
			const source = createSource(
				"handler",
				"Function",
				"src/api.ts",
				"core",
				"myPackage",
			);
			const dependencies: DependencyWithEdge[] = [
				createDependency(
					"User",
					"Interface",
					"src/types/User.ts",
					"shared",
					"types",
					"parameter",
				),
			];

			const result = formatTypeDependencies(source, dependencies);
			expect(result).toContain("package: myPackage");
		});

		it("omits both module and package when both are implicit defaults", () => {
			const source = createSource(
				"handler",
				"Function",
				"src/api.ts",
				IMPLICIT_MODULE_NAME,
				IMPLICIT_PACKAGE_NAME,
			);
			const dependencies: DependencyWithEdge[] = [
				createDependency(
					"User",
					"Interface",
					"src/types/User.ts",
					"shared",
					"types",
					"parameter",
				),
			];

			const result = formatTypeDependencies(source, dependencies);
			expect(result).not.toContain("module:");
			expect(result).not.toContain("package:");
			expect(result).toContain("source: handler");
			expect(result).toContain("type: Function");
		});
	});
});
