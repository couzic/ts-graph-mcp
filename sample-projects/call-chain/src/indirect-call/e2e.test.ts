import { join } from "node:path";
import { type Database } from "better-sqlite3";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { ProjectConfig } from "../../../../src/config/Config.schemas.js";
import {
	closeDatabase,
	openDatabase,
} from "../../../../src/db/sqlite/sqliteConnection.utils.js";
import { initializeSchema } from "../../../../src/db/sqlite/sqliteSchema.utils.js";
import { createSqliteWriter } from "../../../../src/db/sqlite/createSqliteWriter.js";
import { indexProject } from "../../../../src/ingestion/indexProject.js";
import { dependenciesOf } from "../../../../src/tools/dependencies-of/dependenciesOf.js";
import { dependentsOf } from "../../../../src/tools/dependents-of/dependentsOf.js";
import { pathsBetween } from "../../../../src/tools/paths-between/pathsBetween.js";

/**
 * E2E tests for indirect function calls.
 *
 * Pattern: const fn = target; fn();
 *
 * This tests that when a function is stored in a local variable
 * and then invoked, we correctly create a CALLS edge to the original function.
 */
describe("indirect call E2E tests", () => {
	let db: Database;
	let projectRoot: string;

	beforeAll(async () => {
		db = openDatabase({ path: ":memory:" });
		initializeSchema(db);

		projectRoot = join(import.meta.dirname, "../..");
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

	describe("dependenciesOf", () => {
		it("finds target from caller (indirect call via variable)", () => {
			const output = dependenciesOf(db, projectRoot, "src/indirect-call/caller.ts", "caller");

			expect(output).toBe(`## Graph

caller --CALLS--> target

## Nodes

target:
  file: src/indirect-call/target.ts
  offset: 1, limit: 3
  snippet:
    1: export function target(): string {
    2: 	return "target";
    3: }
`);
		});
	});

	describe("dependentsOf", () => {
		it("finds caller as dependent of target", () => {
			const output = dependentsOf(db, projectRoot, "src/indirect-call/target.ts", "target");

			expect(output).toBe(`## Graph

caller --CALLS--> target

## Nodes

caller:
  file: src/indirect-call/caller.ts
  offset: 4, limit: 4
  snippet:
    4: export function caller(): string {
    5: 	const fn = target;
    6: 	return fn();
    7: }
`);
		});
	});

	describe("pathsBetween", () => {
		it("finds direct path from caller to target", () => {
			const output = pathsBetween(
				db,
				projectRoot,
				{ file_path: "src/indirect-call/caller.ts", symbol: "caller" },
				{ file_path: "src/indirect-call/target.ts", symbol: "target" },
			);

			// Direct edge with no intermediate nodes - Nodes section empty
			expect(output).toBe(`## Graph

caller --CALLS--> target`);
		});
	});
});
