import { join } from "node:path";
import type Database from "better-sqlite3";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { ProjectConfig } from "../../config/Config.schemas.js";
import { createSqliteWriter } from "../../db/sqlite/createSqliteWriter.js";
import {
	closeDatabase,
	openDatabase,
} from "../../db/sqlite/sqliteConnection.utils.js";
import { initializeSchema } from "../../db/sqlite/sqliteSchema.utils.js";
import { indexProject } from "../../ingestion/indexProject.js";
import { queryPackageDeps } from "./query.js";

const monorepoRoot = join(
	import.meta.dirname,
	"../../../sample-projects/monorepo",
);

const config: ProjectConfig = {
	modules: [
		{
			name: "shared",
			packages: [
				{
					name: "types",
					tsconfig: "modules/shared/packages/types/tsconfig.json",
				},
				{
					name: "utils",
					tsconfig: "modules/shared/packages/utils/tsconfig.json",
				},
			],
		},
		{
			name: "backend",
			packages: [
				{
					name: "services",
					tsconfig: "modules/backend/packages/services/tsconfig.json",
				},
				{
					name: "api",
					tsconfig: "modules/backend/packages/api/tsconfig.json",
				},
			],
		},
		{
			name: "frontend",
			packages: [
				{
					name: "state",
					tsconfig: "modules/frontend/packages/state/tsconfig.json",
				},
				{
					name: "ui",
					tsconfig: "modules/frontend/packages/ui/tsconfig.json",
				},
			],
		},
	],
	storage: { type: "sqlite" },
};

describe.skip(queryPackageDeps.name, () => {
	let db: Database.Database;

	beforeAll(async () => {
		db = openDatabase({ path: ":memory:" });
		initializeSchema(db);
		const writer = createSqliteWriter(db);
		await indexProject(config, writer, { projectRoot: monorepoRoot });
	});

	afterAll(() => {
		closeDatabase(db);
	});

	it("returns empty result for package with no dependencies", () => {
		// shared/types has no dependencies (it's a leaf package)
		const result = queryPackageDeps(db, "shared", "types", 100);

		expect(result.packages).toEqual([]);
		expect(result.dependencies).toEqual([]);
	});

	it("finds direct dependencies only with maxDepth=1", () => {
		// backend/api depends on:
		// - backend/services (depth 1)
		// - shared/types (depth 1)

		const result = queryPackageDeps(db, "backend", "api", 1);

		// Should have 2 packages at depth 1
		expect(result.packages.length).toBe(2);

		const backendServices = result.packages.find(
			(p) => p.module === "backend" && p.package === "services",
		);
		expect(backendServices).toBeDefined();
		expect(backendServices?.depth).toBe(1);

		const sharedTypes = result.packages.find(
			(p) => p.module === "shared" && p.package === "types",
		);
		expect(sharedTypes).toBeDefined();
		expect(sharedTypes?.depth).toBe(1);

		// Should include all edges in the subgraph (center + discovered packages)
		// This includes edges from backend/api and edges between discovered packages
		expect(result.dependencies.length).toBeGreaterThanOrEqual(2);

		// Verify at least the direct edges from center exist
		const apiToServices = result.dependencies.find(
			(d) =>
				d.fromModule === "backend" &&
				d.fromPackage === "api" &&
				d.toModule === "backend" &&
				d.toPackage === "services",
		);
		expect(apiToServices).toBeDefined();

		const apiToTypes = result.dependencies.find(
			(d) =>
				d.fromModule === "backend" &&
				d.fromPackage === "api" &&
				d.toModule === "shared" &&
				d.toPackage === "types",
		);
		expect(apiToTypes).toBeDefined();
	});

	it("finds transitive dependencies with maxDepth=2", () => {
		// backend/api depends on:
		// - backend/services (depth 1) → shared/types (depth 2)
		// - shared/types (depth 1)      → shared/utils (depth 2)

		const result = queryPackageDeps(db, "backend", "api", 2);

		// Should have at least 3 packages (services, types at depth 1; utils at depth 2)
		expect(result.packages.length).toBeGreaterThanOrEqual(3);

		// Check depth 1 packages
		const services = result.packages.find(
			(p) => p.module === "backend" && p.package === "services",
		);
		expect(services?.depth).toBe(1);

		const types = result.packages.find(
			(p) => p.module === "shared" && p.package === "types",
		);
		expect(types?.depth).toBe(1);

		// Check depth 2 package (utils is transitively reachable)
		const utils = result.packages.find(
			(p) => p.module === "shared" && p.package === "utils",
		);
		expect(utils?.depth).toBe(2);

		// Verify dependencies include transitive edges
		expect(result.dependencies.length).toBeGreaterThan(2);
	});

	it("finds all transitive dependencies with default maxDepth", () => {
		// backend/api transitively depends on multiple packages
		const result = queryPackageDeps(db, "backend", "api", 100);

		// Should include at least backend/services and shared packages
		expect(result.packages.length).toBeGreaterThanOrEqual(2);

		// Verify at least one shared module package is found
		const hasSharedDep = result.packages.some((p) => p.module === "shared");
		expect(hasSharedDep).toBe(true);
	});

	it("handles cross-module dependencies correctly", () => {
		// backend/services depends on shared/types and shared/utils (cross-module)
		const result = queryPackageDeps(db, "backend", "services", 1);

		// Should have both shared packages at depth 1
		expect(result.packages.length).toBeGreaterThanOrEqual(2);

		const sharedTypes = result.packages.find(
			(p) => p.module === "shared" && p.package === "types",
		);
		expect(sharedTypes).toBeDefined();
		expect(sharedTypes?.depth).toBe(1);

		const sharedUtils = result.packages.find(
			(p) => p.module === "shared" && p.package === "utils",
		);
		expect(sharedUtils).toBeDefined();
		expect(sharedUtils?.depth).toBe(1);
	});

	it("excludes self-dependencies (same package imports)", () => {
		// Any package that imports from itself should not show up in dependencies
		const result = queryPackageDeps(db, "backend", "api", 100);

		// No edge should have same source and target package
		for (const dep of result.dependencies) {
			const samePackage =
				dep.fromModule === dep.toModule && dep.fromPackage === dep.toPackage;
			expect(samePackage).toBe(false);
		}
	});

	it("returns consistent depth values (minimal distance)", () => {
		// If a package is reachable via multiple paths, depth should be the minimal distance
		const result = queryPackageDeps(db, "backend", "api", 100);

		// Check that MIN(depth) is used in the query (no duplicate packages with different depths)
		const packageKeys = result.packages.map((p) => `${p.module}/${p.package}`);
		const uniqueKeys = new Set(packageKeys);
		expect(packageKeys.length).toBe(uniqueKeys.size);
	});
});
