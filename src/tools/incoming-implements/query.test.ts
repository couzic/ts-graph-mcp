import { join } from "node:path";
import type Database from "better-sqlite3";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { ProjectConfig } from "../../config/ConfigSchema.js";
import {
	closeDatabase,
	openDatabase,
} from "../../db/sqlite/SqliteConnection.js";
import { initializeSchema } from "../../db/sqlite/SqliteSchema.js";
import { createSqliteWriter } from "../../db/sqlite/SqliteWriter.js";
import { indexProject } from "../../ingestion/Ingestion.js";
import { queryImplementers } from "./query.js";

describe(queryImplementers.name, () => {
	let db: Database.Database;

	beforeAll(async () => {
		db = openDatabase({ path: ":memory:" });
		initializeSchema(db);

		const projectRoot = join(
			import.meta.dirname,
			"../../../sample-projects/mixed-types",
		);
		const config: ProjectConfig = {
			modules: [
				{
					name: "test",
					packages: [{ name: "main", tsconfig: "tsconfig.json" }],
				},
			],
		};
		const writer = createSqliteWriter(db);
		await indexProject(config, writer, { projectRoot });
	});

	afterAll(() => {
		closeDatabase(db);
	});

	it("finds classes implementing Auditable interface", () => {
		const result = queryImplementers(db, "src/types.ts:Auditable");

		expect(result).toHaveLength(2);
		const names = result.map((r) => r.name);
		expect(names).toContain("AuditLog");
		expect(names).toContain("ActivityLog");
		expect(result.every((r) => r.type === "Class")).toBe(true);
	});

	it("returns empty array for interface with no implementations", () => {
		const result = queryImplementers(db, "src/types.ts:User");

		expect(result).toHaveLength(0);
	});

	it("returns empty array for non-existent interface", () => {
		const result = queryImplementers(db, "src/types.ts:NonExistent");

		expect(result).toHaveLength(0);
	});

	it("orders results by package, module, name", () => {
		const result = queryImplementers(db, "src/types.ts:Auditable");

		expect(result).toHaveLength(2);
		// Results are alphabetically ordered by name
		expect(result[0]?.name).toBe("ActivityLog");
		expect(result[1]?.name).toBe("AuditLog");
	});
});
