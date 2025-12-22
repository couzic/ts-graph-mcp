import { describe, expect, it } from "vitest";
import type { SymbolLocation } from "../shared/resolveSymbol.js";
import { formatImports } from "./format.js";
import type { ImportResult } from "./query.js";

/**
 * Helper to create a test SymbolLocation
 */
function createSource(
	file = "src/api/userRoutes.ts",
	module = "backend",
	packageName = "api",
): SymbolLocation {
	return {
		name: "userRoutes.ts",
		type: "File",
		file,
		offset: 1,
		limit: 50,
		module,
		package: packageName,
		id: file,
	};
}

/**
 * Helper to create ImportResult test data
 */
function createImport(
	name: string,
	module: string,
	packageName: string,
	importedSymbols: string[] = [],
	isTypeOnly = false,
): ImportResult {
	return {
		node: {
			id: `src/types/${name}.ts`,
			type: "File",
			name,
			module,
			package: packageName,
			filePath: `src/types/${name}.ts`,
			startLine: 1,
			endLine: 20,
			exported: true,
			extension: ".ts",
		},
		importedSymbols,
		isTypeOnly,
	};
}

describe(formatImports.name, () => {
	it("formats empty imports list", () => {
		const source = createSource();
		const result = formatImports(source, []);

		expect(result).toContain("file: src/api/userRoutes.ts");
		expect(result).toContain("imports: none");
	});

	it("formats single import", () => {
		const source = createSource();
		const imports: ImportResult[] = [
			createImport("User", "shared", "types", ["User"], true),
		];

		const result = formatImports(source, imports);
		expect(result).toContain("imports (1 packages):");
		expect(result).toContain("shared/types:");
		expect(result).toContain("- User (type-only)");
	});

	it("groups imports by package", () => {
		const source = createSource();
		const imports: ImportResult[] = [
			createImport("User", "shared", "types", ["User"], true),
			createImport("Config", "shared", "types", ["Config"], true),
			createImport("createUser", "backend", "services", ["createUserService"]),
			createImport("getUser", "backend", "services", ["getUserSummary"]),
		];

		const result = formatImports(source, imports);
		expect(result).toContain("imports (2 packages):");
		expect(result).toContain("shared/types:");
		expect(result).toContain("backend/services:");
	});

	it("sorts packages alphabetically", () => {
		const source = createSource();
		const imports: ImportResult[] = [
			createImport("z", "z-module", "z-package", ["Z"]),
			createImport("a", "a-module", "a-package", ["A"]),
			createImport("m", "m-module", "m-package", ["M"]),
		];

		const result = formatImports(source, imports);

		const aIndex = result.indexOf("a-module/a-package:");
		const mIndex = result.indexOf("m-module/m-package:");
		const zIndex = result.indexOf("z-module/z-package:");

		expect(aIndex).toBeLessThan(mIndex);
		expect(mIndex).toBeLessThan(zIndex);
	});

	it("sorts imports alphabetically within package", () => {
		const source = createSource();
		const imports: ImportResult[] = [
			createImport("Z", "shared", "types", ["Z"]),
			createImport("A", "shared", "types", ["A"]),
			createImport("M", "shared", "types", ["M"]),
		];

		const result = formatImports(source, imports);

		// Extract the lines for shared/types package
		const lines = result.split("\n");
		const pkgIndex = lines.indexOf("shared/types:");
		const imports_section = lines.slice(pkgIndex + 1, pkgIndex + 4);

		expect(imports_section[0]).toContain("- A");
		expect(imports_section[1]).toContain("- M");
		expect(imports_section[2]).toContain("- Z");
	});

	it("formats imported symbols", () => {
		const source = createSource();
		const imports: ImportResult[] = [
			createImport("types", "shared", "types", ["User", "Config"], true),
		];

		const result = formatImports(source, imports);
		expect(result).toContain("- User (type-only)");
		expect(result).toContain("- Config (type-only)");
	});

	it("formats mixed type-only and value imports", () => {
		const source = createSource();
		const imports: ImportResult[] = [
			createImport("User", "shared", "types", ["User"], true),
			createImport("createUser", "backend", "services", ["createUser"], false),
		];

		const result = formatImports(source, imports);
		expect(result).toContain("- User (type-only)");
		expect(result).toContain("- createUser");
		expect(result).not.toContain("- createUser (type-only)");
	});

	it("handles imports with no imported symbols metadata", () => {
		const source = createSource();
		const imports: ImportResult[] = [
			createImport("User", "shared", "types", [], false),
		];

		const result = formatImports(source, imports);
		expect(result).toContain("- User");
	});

	describe("module/package omission", () => {
		it("header does not show module/package (only file)", () => {
			// Note: formatImports header only shows "file:", not module/package
			const source = createSource("src/test.ts", "default", "default");
			const imports: ImportResult[] = [
				createImport("User", "shared", "types", ["User"]),
			];

			const result = formatImports(source, imports);
			const lines = result.split("\n");

			// Check header only has file line
			expect(lines[0]).toBe("file: src/test.ts");
			// Imports start on line 1
			expect(lines[1]).toContain("imports");
		});

		it("shows module/package in group headers", () => {
			const source = createSource();
			const imports: ImportResult[] = [
				createImport("User", "myModule", "myPackage", ["User"]),
			];

			const result = formatImports(source, imports);
			expect(result).toContain("myModule/myPackage:");
		});
	});
});
