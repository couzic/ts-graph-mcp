import { join } from "node:path";
import type Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	closeDatabase,
	openDatabase,
} from "../../db/sqlite/SqliteConnection.js";
import { initializeSchema } from "../../db/sqlite/SqliteSchema.js";
import { createSqliteWriter } from "../../db/sqlite/SqliteWriter.js";
import type { Edge, FileNode } from "../../db/Types.js";
import { indexProject } from "../../ingestion/Ingestion.js";
import { queryImporters } from "./query.js";

// Test data factory - creates minimal file nodes
const file = (path: string, module = "test", pkg = "main"): FileNode => ({
	id: path,
	type: "File",
	name: path.split("/").pop() || path,
	module,
	package: pkg,
	filePath: path,
	startLine: 1,
	endLine: 100,
	exported: false,
});

const imports = (from: string, to: string, symbols?: string[]): Edge => ({
	source: from,
	target: to,
	type: "IMPORTS",
	importedSymbols: symbols,
});

describe(queryImporters.name, () => {
	let db: Database.Database;

	beforeEach(() => {
		db = openDatabase({ path: ":memory:" });
		initializeSchema(db);
	});

	afterEach(() => {
		closeDatabase(db);
	});

	it("returns empty array when file has no importers", async () => {
		const writer = createSqliteWriter(db);
		const fileA = file("src/a.ts");
		await writer.addNodes([fileA]);

		const result = queryImporters(db, fileA.id);

		expect(result).toEqual([]);
	});

	it("returns direct importers", async () => {
		const writer = createSqliteWriter(db);
		const fileA = file("src/a.ts");
		const fileB = file("src/b.ts");
		await writer.addNodes([fileA, fileB]);
		await writer.addEdges([imports(fileB.id, fileA.id, ["foo"])]);

		const result = queryImporters(db, fileA.id);

		expect(result).toHaveLength(1);
		expect(result[0]?.node.id).toBe(fileB.id);
		expect(result[0]?.edge.importedSymbols).toEqual(["foo"]);
	});

	it("returns multiple importers from different files", async () => {
		const writer = createSqliteWriter(db);
		const fileA = file("src/a.ts");
		const fileB = file("src/b.ts");
		const fileC = file("src/c.ts");
		await writer.addNodes([fileA, fileB, fileC]);
		await writer.addEdges([
			imports(fileB.id, fileA.id, ["foo"]),
			imports(fileC.id, fileA.id, ["bar"]),
		]);

		const result = queryImporters(db, fileA.id);

		expect(result).toHaveLength(2);
		const ids = result.map((r) => r.node.id);
		expect(ids).toContain(fileB.id);
		expect(ids).toContain(fileC.id);
	});

	it("returns importers from different packages", async () => {
		const writer = createSqliteWriter(db);
		const fileA = file("src/a.ts", "mod1", "pkg1");
		const fileB = file("src/b.ts", "mod2", "pkg2");
		const fileC = file("src/c.ts", "mod3", "pkg3");
		await writer.addNodes([fileA, fileB, fileC]);
		await writer.addEdges([
			imports(fileB.id, fileA.id, ["User"]),
			imports(fileC.id, fileA.id, ["Config"]),
		]);

		const result = queryImporters(db, fileA.id);

		expect(result).toHaveLength(2);
		expect(result[0]?.node.package).toBe("pkg2");
		expect(result[1]?.node.package).toBe("pkg3");
	});

	it("includes edge metadata (isTypeOnly, importedSymbols)", async () => {
		const writer = createSqliteWriter(db);
		const fileA = file("src/types.ts");
		const fileB = file("src/b.ts");
		await writer.addNodes([fileA, fileB]);
		await writer.addEdges([
			{
				source: fileB.id,
				target: fileA.id,
				type: "IMPORTS",
				isTypeOnly: true,
				importedSymbols: ["User", "Config"],
			},
		]);

		const result = queryImporters(db, fileA.id);

		expect(result).toHaveLength(1);
		expect(result[0]?.edge.isTypeOnly).toBe(true);
		expect(result[0]?.edge.importedSymbols).toEqual(["User", "Config"]);
	});

	it("ignores non-IMPORTS edges", async () => {
		const writer = createSqliteWriter(db);
		const fileA = file("src/a.ts");
		const fileB = file("src/b.ts");
		await writer.addNodes([fileA, fileB]);
		await writer.addEdges([
			{ source: fileB.id, target: fileA.id, type: "USES_TYPE" }, // Not an IMPORTS edge
		]);

		const result = queryImporters(db, fileA.id);

		expect(result).toEqual([]);
	});

	it("orders results by package, module, file_path", async () => {
		const writer = createSqliteWriter(db);
		const fileA = file("src/target.ts", "mod1", "pkg1");
		const fileB = file("src/b.ts", "mod2", "pkg2");
		const fileC = file("src/c.ts", "mod1", "pkg2");
		const fileD = file("src/d.ts", "mod2", "pkg1");
		await writer.addNodes([fileA, fileB, fileC, fileD]);
		await writer.addEdges([
			imports(fileB.id, fileA.id),
			imports(fileC.id, fileA.id),
			imports(fileD.id, fileA.id),
		]);

		const result = queryImporters(db, fileA.id);

		expect(result).toHaveLength(3);
		// Expected order: pkg1/mod2, pkg2/mod1, pkg2/mod2
		expect(result[0]?.node.id).toBe(fileD.id); // pkg1/mod2
		expect(result[1]?.node.id).toBe(fileC.id); // pkg2/mod1
		expect(result[2]?.node.id).toBe(fileB.id); // pkg2/mod2
	});
});

describe("monorepo integration", () => {
	let db: Database.Database;

	beforeEach(async () => {
		db = openDatabase({ path: ":memory:" });
		initializeSchema(db);
		const writer = createSqliteWriter(db);
		const projectRoot = join(
			import.meta.dirname,
			"../../../sample-projects/monorepo",
		);

		// Index the monorepo project
		await indexProject(
			{
				modules: [
					{
						name: "shared",
						packages: [
							{
								name: "types",
								tsconfig: "./modules/shared/packages/types/tsconfig.json",
							},
							{
								name: "utils",
								tsconfig: "./modules/shared/packages/utils/tsconfig.json",
							},
						],
					},
					{
						name: "backend",
						packages: [
							{
								name: "services",
								tsconfig: "./modules/backend/packages/services/tsconfig.json",
							},
							{
								name: "api",
								tsconfig: "./modules/backend/packages/api/tsconfig.json",
							},
						],
					},
				],
			},
			writer,
			{ projectRoot },
		);
	});

	afterEach(() => {
		closeDatabase(db);
	});

	it("finds cross-module importers of User.ts", () => {
		// User.ts is in shared/types, should be imported by backend/services and backend/api
		const userFileId = "modules/shared/packages/types/src/User.ts";

		const result = queryImporters(db, userFileId);

		// Should have at least 2 importers: userService.ts and userRoutes.ts
		expect(result.length).toBeGreaterThanOrEqual(2);

		const importerFiles = result.map((r) => r.node.filePath);
		expect(importerFiles).toContain(
			"modules/backend/packages/services/src/userService.ts",
		);
		expect(importerFiles).toContain(
			"modules/backend/packages/api/src/userRoutes.ts",
		);
	});

	it("includes imported symbols metadata", () => {
		const userFileId = "modules/shared/packages/types/src/User.ts";

		const result = queryImporters(db, userFileId);

		// Find all userService.ts importers (there may be multiple import edges)
		const userServiceImporters = result.filter(
			(r) =>
				r.node.filePath ===
				"modules/backend/packages/services/src/userService.ts",
		);

		expect(userServiceImporters.length).toBeGreaterThan(0);

		// Collect all imported symbols from all edges
		const allImportedSymbols = new Set<string>();
		for (const importer of userServiceImporters) {
			if (importer.edge.importedSymbols) {
				for (const symbol of importer.edge.importedSymbols) {
					allImportedSymbols.add(symbol);
				}
			}
		}

		// At least one of the imports should include these symbols
		expect(
			allImportedSymbols.has("User") || allImportedSymbols.has("createUser"),
		).toBe(true);
	});

	it("groups importers by package", () => {
		const userFileId = "modules/shared/packages/types/src/User.ts";

		const result = queryImporters(db, userFileId);

		// Get unique packages
		const packages = new Set(result.map((r) => r.node.package));

		// Should have importers from multiple packages
		expect(packages.size).toBeGreaterThan(1);
		expect(packages.has("services")).toBe(true);
		expect(packages.has("api")).toBe(true);
	});
});
