import { describe, expect, it } from "vitest";
import {
	IMPLICIT_MODULE_NAME,
	IMPLICIT_PACKAGE_NAME,
} from "../shared/nodeFormatters.js";
import type { SymbolLocation } from "../shared/resolveSymbol.js";
import { formatImporters } from "./format.js";
import type { ImporterWithEdge } from "./query.js";

/**
 * Helper to create a test SymbolLocation
 */
function createTarget(
	file = "src/types/User.ts",
	module = "shared",
	packageName = "types",
): SymbolLocation {
	return {
		name: "User.ts",
		type: "File",
		file,
		offset: 1,
		limit: 20,
		module,
		package: packageName,
		id: file,
	};
}

/**
 * Helper to create ImporterWithEdge test data
 */
function createImporter(
	filePath: string,
	module: string,
	packageName: string,
	importedSymbols: string[] = [],
	isTypeOnly = false,
): ImporterWithEdge {
	return {
		node: {
			id: filePath,
			type: "File",
			name: filePath.split("/").pop() ?? filePath,
			module,
			package: packageName,
			filePath,
			startLine: 1,
			endLine: 50,
			exported: false,
			extension: ".ts",
		},
		edge: {
			source: filePath,
			target: "src/types/User.ts",
			type: "IMPORTS",
			importedSymbols,
			isTypeOnly,
		},
	};
}

describe(formatImporters.name, () => {
	it("formats empty importer list", () => {
		const target = createTarget();
		const result = formatImporters(target, []);

		expect(result).toContain("file: src/types/User.ts");
		expect(result).toContain("type: File");
		expect(result).toContain("offset: 1");
		expect(result).toContain("limit: 20");
		expect(result).toContain("module: shared");
		expect(result).toContain("package: types");
		expect(result).toContain("imported by (0 packages):");
		expect(result).toContain("(no importers found)");
	});

	it("formats single importer", () => {
		const target = createTarget();
		const importers: ImporterWithEdge[] = [
			createImporter("src/api/userRoutes.ts", "backend", "api", ["User"], true),
		];

		const result = formatImporters(target, importers);
		expect(result).toContain("imported by (1 packages):");
		expect(result).toContain("api:");
		expect(result).toContain("- src/api/userRoutes.ts (User, type-only)");
		expect(result).toContain("offset: 1, limit: 50");
	});

	it("groups importers by package", () => {
		const target = createTarget();
		const importers: ImporterWithEdge[] = [
			createImporter("src/api/userRoutes.ts", "backend", "api", ["User"]),
			createImporter("src/services/userService.ts", "backend", "services", [
				"User",
				"createUser",
			]),
			createImporter("src/ui/UserCard.ts", "frontend", "ui", ["User"], true),
		];

		const result = formatImporters(target, importers);
		expect(result).toContain("imported by (3 packages):");
		expect(result).toContain("api:");
		expect(result).toContain("services:");
		expect(result).toContain("ui:");
	});

	it("sorts packages alphabetically", () => {
		const target = createTarget();
		const importers: ImporterWithEdge[] = [
			createImporter("src/z.ts", "z", "z-package", ["User"]),
			createImporter("src/a.ts", "a", "a-package", ["User"]),
			createImporter("src/m.ts", "m", "m-package", ["User"]),
		];

		const result = formatImporters(target, importers);

		const aIndex = result.indexOf("a-package:");
		const mIndex = result.indexOf("m-package:");
		const zIndex = result.indexOf("z-package:");

		expect(aIndex).toBeLessThan(mIndex);
		expect(mIndex).toBeLessThan(zIndex);
	});

	it("formats imported symbols metadata", () => {
		const target = createTarget();
		const importers: ImporterWithEdge[] = [
			createImporter(
				"src/api/handler.ts",
				"backend",
				"api",
				["User", "Config"],
				false,
			),
		];

		const result = formatImporters(target, importers);
		expect(result).toContain("- src/api/handler.ts (User, Config)");
	});

	it("formats type-only imports", () => {
		const target = createTarget();
		const importers: ImporterWithEdge[] = [
			createImporter("src/types/index.ts", "shared", "types", ["User"], true),
		];

		const result = formatImporters(target, importers);
		expect(result).toContain("- src/types/index.ts (User, type-only)");
	});

	describe("module/package omission", () => {
		it("omits module when IMPLICIT_MODULE_NAME", () => {
			const target = createTarget("src/utils.ts", IMPLICIT_MODULE_NAME, "main");
			const importers: ImporterWithEdge[] = [
				createImporter("src/api/handler.ts", "backend", "api", ["utils"]),
			];

			const result = formatImporters(target, importers);
			expect(result).not.toContain("module:");
			expect(result).toContain("package: main");
		});

		it("includes module when value is not 'default'", () => {
			const target = createTarget("src/utils.ts", "myModule", "main");
			const importers: ImporterWithEdge[] = [
				createImporter("src/api/handler.ts", "backend", "api", ["utils"]),
			];

			const result = formatImporters(target, importers);
			expect(result).toContain("module: myModule");
		});

		it("omits package when IMPLICIT_PACKAGE_NAME", () => {
			const target = createTarget(
				"src/utils.ts",
				"core",
				IMPLICIT_PACKAGE_NAME,
			);
			const importers: ImporterWithEdge[] = [
				createImporter("src/api/handler.ts", "backend", "api", ["utils"]),
			];

			const result = formatImporters(target, importers);
			expect(result).toContain("module: core");
			expect(result).not.toContain("package:");
		});

		it("includes package when value is not 'default'", () => {
			const target = createTarget("src/utils.ts", "core", "myPackage");
			const importers: ImporterWithEdge[] = [
				createImporter("src/api/handler.ts", "backend", "api", ["utils"]),
			];

			const result = formatImporters(target, importers);
			expect(result).toContain("package: myPackage");
		});

		it("omits both module and package when both are IMPLICIT values", () => {
			const target = createTarget(
				"src/utils.ts",
				IMPLICIT_MODULE_NAME,
				IMPLICIT_PACKAGE_NAME,
			);
			const importers: ImporterWithEdge[] = [
				createImporter("src/api/handler.ts", "backend", "api", ["utils"]),
			];

			const result = formatImporters(target, importers);
			expect(result).not.toContain("module:");
			expect(result).not.toContain("package:");
			expect(result).toContain("file: src/utils.ts");
			expect(result).toContain("type: File");
		});
	});
});
