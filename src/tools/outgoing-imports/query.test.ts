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
import { queryImports } from "./query.js";

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
	],
	storage: { type: "sqlite" },
};

describe(queryImports.name, () => {
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

	it("returns empty array when file has no imports", () => {
		// User.ts has no imports
		const fileId = "modules/shared/packages/types/src/User.ts";

		const result = queryImports(db, fileId);

		expect(result).toEqual([]);
	});

	it("returns outgoing IMPORTS from userRoutes.ts", () => {
		// userRoutes.ts imports:
		// - import type { User } from "@shared/types/User";
		// - import { createUserService, getUserSummary, type UserServiceResponse } from "@backend/services/userService";

		// File node ID is just the file path (no symbol part)
		const fileId = "modules/backend/packages/api/src/userRoutes.ts";

		const result = queryImports(db, fileId);

		// Should have 2 imports: one to shared/types, one to backend/services
		expect(result.length).toBe(2);

		// Find the User.ts import
		const userImport = result.find(
			(r) => r.node.filePath === "modules/shared/packages/types/src/User.ts",
		);
		expect(userImport).toBeDefined();
		expect(userImport?.isTypeOnly).toBe(true); // import type
		expect(userImport?.importedSymbols).toContain("User");

		// Find the userService.ts import
		const serviceImport = result.find(
			(r) =>
				r.node.filePath ===
				"modules/backend/packages/services/src/userService.ts",
		);
		expect(serviceImport).toBeDefined();
		expect(serviceImport?.isTypeOnly).toBe(false); // regular import with functions
		expect(serviceImport?.importedSymbols).toContain("createUserService");
		expect(serviceImport?.importedSymbols).toContain("getUserSummary");
		expect(serviceImport?.importedSymbols).toContain("UserServiceResponse");
	});

	it("returns outgoing IMPORTS from userService.ts", () => {
		// userService.ts imports from shared module (cross-module)
		const fileId = "modules/backend/packages/services/src/userService.ts";

		const result = queryImports(db, fileId);

		// Should have 3 imports: User.ts, formatDate.ts, validate.ts
		expect(result.length).toBe(3);

		// Verify we get both packages from shared module
		const packages = new Set(
			result.map((r) => `${r.node.module}/${r.node.package}`),
		);
		expect(packages.has("shared/types")).toBe(true);
		expect(packages.has("shared/utils")).toBe(true);
	});

	it("ignores non-IMPORTS edges", () => {
		// Verify that CALLS or other edge types don't appear in results
		const fileId = "modules/backend/packages/api/src/userRoutes.ts";

		const result = queryImports(db, fileId);

		// All results should be File nodes (targets of IMPORTS edges)
		for (const imp of result) {
			expect(imp.node.type).toBe("File");
		}
	});
});
