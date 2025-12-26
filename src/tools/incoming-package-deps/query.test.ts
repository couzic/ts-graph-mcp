import { join } from "node:path";
import type Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createSqliteWriter } from "../../db/sqlite/createSqliteWriter.js";
import {
	closeDatabase,
	openDatabase,
} from "../../db/sqlite/sqliteConnection.utils.js";
import { initializeSchema } from "../../db/sqlite/sqliteSchema.utils.js";
import type { Edge, FileNode } from "../../db/Types.js";
import { indexProject } from "../../ingestion/indexProject.js";
import { queryIncomingPackageDeps } from "./query.js";

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

const imports = (from: string, to: string): Edge => ({
	source: from,
	target: to,
	type: "IMPORTS",
});

describe.skip(queryIncomingPackageDeps.name, () => {
	let db: Database.Database;

	beforeEach(() => {
		db = openDatabase({ path: ":memory:" });
		initializeSchema(db);
	});

	afterEach(() => {
		closeDatabase(db);
	});

	it("returns centerExists=false when package does not exist", async () => {
		const result = queryIncomingPackageDeps(db, {
			module: "nonexistent",
			package: "pkg",
			maxDepth: 100,
		});

		expect(result.centerExists).toBe(false);
		expect(result.packages).toEqual([]);
		expect(result.dependencies).toEqual([]);
	});

	it("returns only center package when no dependents exist", async () => {
		const writer = createSqliteWriter(db);
		const fileA = file("src/a.ts", "mod1", "pkg1");
		await writer.addNodes([fileA]);

		const result = queryIncomingPackageDeps(db, {
			module: "mod1",
			package: "pkg1",
			maxDepth: 100,
		});

		expect(result.centerExists).toBe(true);
		expect(result.packages).toHaveLength(1);
		expect(result.packages[0]?.packageId).toBe("mod1/pkg1");
		expect(result.packages[0]?.depth).toBe(0);
		expect(result.dependencies).toEqual([]);
	});

	it("finds direct dependent packages", async () => {
		const writer = createSqliteWriter(db);
		const fileA = file("src/a.ts", "mod1", "pkg1");
		const fileB = file("src/b.ts", "mod2", "pkg2");
		await writer.addNodes([fileA, fileB]);
		await writer.addEdges([imports(fileB.id, fileA.id)]);

		const result = queryIncomingPackageDeps(db, {
			module: "mod1",
			package: "pkg1",
			maxDepth: 100,
		});

		expect(result.centerExists).toBe(true);
		expect(result.packages).toHaveLength(2);
		expect(result.packages.map((p) => p.packageId)).toContain("mod1/pkg1");
		expect(result.packages.map((p) => p.packageId)).toContain("mod2/pkg2");

		const pkg2 = result.packages.find((p) => p.packageId === "mod2/pkg2");
		expect(pkg2?.depth).toBe(1);

		expect(result.dependencies).toHaveLength(1);
		expect(result.dependencies[0]).toEqual({
			from: "mod2/pkg2",
			to: "mod1/pkg1",
		});
	});

	it("finds transitive dependent packages (depth 2)", async () => {
		const writer = createSqliteWriter(db);
		const fileA = file("src/a.ts", "mod1", "pkg1");
		const fileB = file("src/b.ts", "mod2", "pkg2");
		const fileC = file("src/c.ts", "mod3", "pkg3");
		await writer.addNodes([fileA, fileB, fileC]);
		await writer.addEdges([
			imports(fileB.id, fileA.id), // pkg2 → pkg1
			imports(fileC.id, fileB.id), // pkg3 → pkg2
		]);

		const result = queryIncomingPackageDeps(db, {
			module: "mod1",
			package: "pkg1",
			maxDepth: 100,
		});

		expect(result.centerExists).toBe(true);
		expect(result.packages).toHaveLength(3);

		const pkg1 = result.packages.find((p) => p.packageId === "mod1/pkg1");
		const pkg2 = result.packages.find((p) => p.packageId === "mod2/pkg2");
		const pkg3 = result.packages.find((p) => p.packageId === "mod3/pkg3");

		expect(pkg1?.depth).toBe(0);
		expect(pkg2?.depth).toBe(1);
		expect(pkg3?.depth).toBe(2);

		expect(result.dependencies).toHaveLength(2);
	});

	it("respects maxDepth parameter", async () => {
		const writer = createSqliteWriter(db);
		const fileA = file("src/a.ts", "mod1", "pkg1");
		const fileB = file("src/b.ts", "mod2", "pkg2");
		const fileC = file("src/c.ts", "mod3", "pkg3");
		await writer.addNodes([fileA, fileB, fileC]);
		await writer.addEdges([
			imports(fileB.id, fileA.id), // pkg2 → pkg1
			imports(fileC.id, fileB.id), // pkg3 → pkg2
		]);

		const result = queryIncomingPackageDeps(db, {
			module: "mod1",
			package: "pkg1",
			maxDepth: 1,
		});

		expect(result.centerExists).toBe(true);
		expect(result.packages).toHaveLength(2); // pkg1 (center) + pkg2 (depth 1)

		const packageIds = result.packages.map((p) => p.packageId);
		expect(packageIds).toContain("mod1/pkg1");
		expect(packageIds).toContain("mod2/pkg2");
		expect(packageIds).not.toContain("mod3/pkg3"); // excluded by maxDepth
	});

	it("excludes self-imports (same package)", async () => {
		const writer = createSqliteWriter(db);
		const fileA = file("src/a.ts", "mod1", "pkg1");
		const fileB = file("src/b.ts", "mod1", "pkg1");
		await writer.addNodes([fileA, fileB]);
		await writer.addEdges([imports(fileB.id, fileA.id)]); // Same package

		const result = queryIncomingPackageDeps(db, {
			module: "mod1",
			package: "pkg1",
			maxDepth: 100,
		});

		expect(result.centerExists).toBe(true);
		expect(result.packages).toHaveLength(1); // Only center
		expect(result.dependencies).toEqual([]); // No cross-package deps
	});

	it("handles multiple files in same package importing target", async () => {
		const writer = createSqliteWriter(db);
		const fileA = file("src/a.ts", "mod1", "pkg1");
		const fileB1 = file("src/b1.ts", "mod2", "pkg2");
		const fileB2 = file("src/b2.ts", "mod2", "pkg2");
		await writer.addNodes([fileA, fileB1, fileB2]);
		await writer.addEdges([
			imports(fileB1.id, fileA.id),
			imports(fileB2.id, fileA.id),
		]);

		const result = queryIncomingPackageDeps(db, {
			module: "mod1",
			package: "pkg1",
			maxDepth: 100,
		});

		expect(result.centerExists).toBe(true);
		expect(result.packages).toHaveLength(2);
		// Should only have one dependency edge (aggregated at package level)
		expect(result.dependencies).toHaveLength(1);
		expect(result.dependencies[0]).toEqual({
			from: "mod2/pkg2",
			to: "mod1/pkg1",
		});
	});

	it("prevents cycles in dependency graph", async () => {
		const writer = createSqliteWriter(db);
		const fileA = file("src/a.ts", "mod1", "pkg1");
		const fileB = file("src/b.ts", "mod2", "pkg2");
		const fileC = file("src/c.ts", "mod3", "pkg3");
		await writer.addNodes([fileA, fileB, fileC]);
		await writer.addEdges([
			imports(fileB.id, fileA.id), // pkg2 → pkg1
			imports(fileC.id, fileB.id), // pkg3 → pkg2
			imports(fileA.id, fileC.id), // pkg1 → pkg3 (creates cycle)
		]);

		const result = queryIncomingPackageDeps(db, {
			module: "mod1",
			package: "pkg1",
			maxDepth: 100,
		});

		// Should complete without infinite loop
		expect(result.centerExists).toBe(true);
		expect(result.packages.length).toBeGreaterThan(0);
		expect(result.packages.length).toBeLessThanOrEqual(3);
	});

	it("works without module filter (package name only)", async () => {
		const writer = createSqliteWriter(db);
		const fileA = file("src/a.ts", "mod1", "pkg1");
		const fileB = file("src/b.ts", "mod2", "pkg2");
		await writer.addNodes([fileA, fileB]);
		await writer.addEdges([imports(fileB.id, fileA.id)]);

		const result = queryIncomingPackageDeps(db, {
			package: "pkg1",
			maxDepth: 100,
		});

		expect(result.centerExists).toBe(true);
		expect(result.packages).toHaveLength(2);
	});
});

describe.skip("monorepo integration", () => {
	let db: Database.Database;

	beforeEach(async () => {
		db = openDatabase({ path: ":memory:" });
		initializeSchema(db);
		const writer = createSqliteWriter(db);
		const projectRoot = join(
			import.meta.dirname,
			"../../../sample-projects/monorepo",
		);

		// Index the monorepo project (3 modules × 2 packages = 6 packages)
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
					{
						name: "frontend",
						packages: [
							{
								name: "state",
								tsconfig: "./modules/frontend/packages/state/tsconfig.json",
							},
							{
								name: "ui",
								tsconfig: "./modules/frontend/packages/ui/tsconfig.json",
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

	it("finds packages that depend on shared/types", () => {
		const result = queryIncomingPackageDeps(db, {
			module: "shared",
			package: "types",
			maxDepth: 100,
		});

		expect(result.centerExists).toBe(true);
		expect(result.packages.length).toBeGreaterThan(1);

		const packageIds = result.packages.map((p) => p.packageId);
		expect(packageIds).toContain("shared/types"); // center

		// shared/types is imported by backend/services, backend/api, etc.
		// Check for at least one dependent
		const dependentPackages = result.packages.filter((p) => p.depth > 0);
		expect(dependentPackages.length).toBeGreaterThan(0);
	});

	it("respects maxDepth=1 for direct dependents only", () => {
		const result = queryIncomingPackageDeps(db, {
			module: "shared",
			package: "types",
			maxDepth: 1,
		});

		expect(result.centerExists).toBe(true);

		// All packages should be depth 0 (center) or depth 1 (direct dependents)
		for (const pkg of result.packages) {
			expect(pkg.depth).toBeLessThanOrEqual(1);
		}
	});

	it("returns dependency edges between packages", () => {
		const result = queryIncomingPackageDeps(db, {
			module: "shared",
			package: "types",
			maxDepth: 100,
		});

		expect(result.centerExists).toBe(true);
		expect(result.dependencies.length).toBeGreaterThan(0);

		// All dependencies should point to packages in the result
		const packageIds = new Set(result.packages.map((p) => p.packageId));
		for (const dep of result.dependencies) {
			expect(packageIds.has(dep.from) || packageIds.has(dep.to)).toBe(true);
		}
	});

	it("handles package with no dependents", () => {
		// frontend/ui likely has no dependents (it's a leaf package)
		const result = queryIncomingPackageDeps(db, {
			module: "frontend",
			package: "ui",
			maxDepth: 100,
		});

		expect(result.centerExists).toBe(true);
		expect(result.packages).toHaveLength(1); // Only center
		expect(result.packages[0]?.packageId).toBe("frontend/ui");
		expect(result.dependencies).toEqual([]);
	});
});
