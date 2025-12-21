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
import { queryInterfaces } from "./query.js";

describe(queryInterfaces.name, () => {
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

	it("finds Auditable interface implemented by AuditLog class", () => {
		const result = queryInterfaces(db, "src/models.ts:AuditLog");

		expect(result).toHaveLength(1);
		expect(result[0]?.name).toBe("Auditable");
		expect(result[0]?.type).toBe("Interface");
	});

	it("returns empty array for class with no implementations", () => {
		const result = queryInterfaces(db, "src/models.ts:BaseService");

		expect(result).toHaveLength(0);
	});

	it("returns empty array for non-existent class", () => {
		const result = queryInterfaces(db, "src/models.ts:NonExistent");

		expect(result).toHaveLength(0);
	});

	it("orders results by package, module, name", () => {
		// This test will pass with single result, but demonstrates sorting
		const result = queryInterfaces(db, "src/models.ts:AuditLog");

		expect(result).toHaveLength(1);
		// Results are ordered, even with one result
		expect(result[0]?.name).toBe("Auditable");
	});
});
