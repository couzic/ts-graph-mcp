import type Database from "better-sqlite3";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { ProjectConfig } from "../../config/ConfigSchema.js";
import { openDatabase } from "../../db/sqlite/SqliteConnection.js";
import { initializeSchema } from "../../db/sqlite/SqliteSchema.js";
import { createSqliteWriter } from "../../db/sqlite/SqliteWriter.js";
import { indexProject } from "../../ingestion/Ingestion.js";
import { queryExtends } from "./query.js";

describe(queryExtends.name, () => {
	let db: Database.Database;

	beforeAll(async () => {
		db = openDatabase({ path: ":memory:" });
		initializeSchema(db);
		const writer = createSqliteWriter(db);

		// Create test config with class hierarchy
		const config: ProjectConfig = {
			modules: [
				{
					name: "test-module",
					packages: [
						{
							name: "test-package",
							tsconfig: "tsconfig.json",
						},
					],
				},
			],
		};

		// Index test project with class hierarchy
		await indexProject(config, writer, {
			projectRoot: `${import.meta.dirname}/test-fixtures`,
		});
	});

	afterAll(() => {
		db.close();
	});

	it("finds direct parent (maxDepth: 1)", () => {
		const nodes = queryExtends(
			db,
			"src/classes.ts:AdminService",
			1, // maxDepth
		);

		expect(nodes).toHaveLength(1);
		expect(nodes[0]?.name).toBe("UserService");
		expect(nodes[0]?.depth).toBe(1);
	});

	it("finds full inheritance chain (default maxDepth)", () => {
		const nodes = queryExtends(db, "src/classes.ts:AdminService");

		expect(nodes).toHaveLength(2);
		expect(nodes[0]?.name).toBe("UserService");
		expect(nodes[0]?.depth).toBe(1);
		expect(nodes[1]?.name).toBe("BaseService");
		expect(nodes[1]?.depth).toBe(2);
	});

	it("handles class with no parent", () => {
		const nodes = queryExtends(db, "src/classes.ts:BaseService");

		expect(nodes).toHaveLength(0);
	});

	it("finds interface inheritance chain", () => {
		const nodes = queryExtends(db, "src/interfaces.ts:AdminUser");

		expect(nodes).toHaveLength(2);
		expect(nodes[0]?.name).toBe("User");
		expect(nodes[0]?.depth).toBe(1);
		expect(nodes[1]?.name).toBe("BaseEntity");
		expect(nodes[1]?.depth).toBe(2);
	});

	it("respects maxDepth limit", () => {
		const nodes = queryExtends(
			db,
			"src/classes.ts:AdminService",
			1, // maxDepth - should only get direct parent
		);

		expect(nodes).toHaveLength(1);
		expect(nodes[0]?.name).toBe("UserService");
		expect(nodes[0]?.depth).toBe(1);
	});
});
