import type Database from "better-sqlite3";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { ProjectConfig } from "../../src/config/Config.schemas.js";
import {
	closeDatabase,
	openDatabase,
} from "../../src/db/sqlite/sqliteConnection.utils.js";
import { initializeSchema } from "../../src/db/sqlite/sqliteSchema.utils.js";
import { createSqliteWriter } from "../../src/db/sqlite/createSqliteWriter.js";
import { indexProject } from "../../src/ingestion/indexProject.js";
import { queryNodes } from "../../src/db/queryNodes.js";
import { queryPath } from "../../src/tools/find-paths/query.js";

/**
 * E2E tests for the REFERENCES edge type via path finding.
 *
 * The REFERENCES edge captures when a function is passed/stored but not directly invoked.
 * E2E tests verify that these edges enable correct path finding through the `queryPath` tool.
 *
 * Key patterns:
 * - Callback arguments: array.map(fn) → creates REFERENCES edge → enables path finding
 * - Object properties: { handler: fn } → creates REFERENCES edge → enables path finding
 * - Variable access: userFormatters[type] → creates REFERENCES edge → enables multi-hop paths
 */
describe("references e2e", () => {
	let db: Database.Database;

	beforeAll(async () => {
		db = openDatabase({ path: ":memory:" });
		initializeSchema(db);

		const config: ProjectConfig = {
			modules: [
				{
					name: "test",
					packages: [{ name: "main", tsconfig: "tsconfig.json" }],
				},
			],
		};
		const writer = createSqliteWriter(db);
		await indexProject(config, writer, { projectRoot: import.meta.dirname });
	});

	afterAll(() => closeDatabase(db));

	describe("indexing verification", () => {
		it("extracts handler functions from handlers.ts", () => {
			const handlers = queryNodes(db, "*", { type: "Function" }).filter(
				(n) => n.filePath === "src/handlers.ts",
			);

			expect(handlers.length).toBe(9);
			const names = handlers.map((n) => n.name).sort();
			expect(names).toEqual([
				"filterActive",
				"formatOutput",
				"handleCreate",
				"handleDelete",
				"handleRead",
				"handleUpdate",
				"logError",
				"transformItem",
				"validateInput",
			]);
		});

		it("extracts dispatcher.ts functions and variable", () => {
			const dispatcherNodes = queryNodes(db, "*").filter(
				(n) => n.filePath === "src/dispatcher.ts",
			);

			const names = dispatcherNodes.map((n) => n.name).sort();
			expect(names).toContain("dispatch");
			expect(names).toContain("getFormatter");
			expect(names).toContain("formatCustomer");
			expect(names).toContain("formatAdmin");
			expect(names).toContain("userFormatters");
		});
	});

	/**
	 * Path finding through callback REFERENCES.
	 *
	 * Pattern: caller → callback argument → target function
	 * Example: processItems uses transformItem as callback to map()
	 */
	describe("callback argument paths", () => {
		it("finds path: processItems → transformItem (via callback reference)", () => {
			const paths = queryPath(
				db,
				"src/callbacks.ts:processItems",
				"src/handlers.ts:transformItem",
			);

			expect(paths.length).toBeGreaterThan(0);
			expect(paths[0]?.nodes).toHaveLength(2);
			expect(paths[0]?.nodes[0]).toBe("src/callbacks.ts:processItems");
			expect(paths[0]?.nodes[1]).toBe("src/handlers.ts:transformItem");
			expect(paths[0]?.edges[0]?.type).toBe("REFERENCES");
		});

		it("finds path: filterItems → filterActive (via callback reference)", () => {
			const paths = queryPath(
				db,
				"src/callbacks.ts:filterItems",
				"src/handlers.ts:filterActive",
			);

			expect(paths.length).toBeGreaterThan(0);
			expect(paths[0]?.nodes).toHaveLength(2);
			expect(paths[0]?.edges[0]?.type).toBe("REFERENCES");
		});
	});

	/**
	 * Path finding through array element REFERENCES.
	 *
	 * Pattern: array variable → stored function
	 * Example: validators array stores validateInput
	 */
	describe("array element paths", () => {
		it("finds path: validators → validateInput (via array storage)", () => {
			const paths = queryPath(
				db,
				"src/registry.ts:validators",
				"src/handlers.ts:validateInput",
			);

			expect(paths.length).toBeGreaterThan(0);
			expect(paths[0]?.nodes).toHaveLength(2);
			expect(paths[0]?.edges[0]?.type).toBe("REFERENCES");
		});

		it("finds path: formatters → formatOutput (via array storage)", () => {
			const paths = queryPath(
				db,
				"src/registry.ts:formatters",
				"src/handlers.ts:formatOutput",
			);

			expect(paths.length).toBeGreaterThan(0);
			expect(paths[0]?.nodes).toHaveLength(2);
			expect(paths[0]?.edges[0]?.type).toBe("REFERENCES");
		});
	});

	/**
	 * Path finding through return value REFERENCES.
	 *
	 * Pattern: factory function → returned function
	 * Example: getErrorHandler returns logError
	 */
	describe("return value paths", () => {
		it("finds path: getErrorHandler → logError (via return reference)", () => {
			const paths = queryPath(
				db,
				"src/factory.ts:getErrorHandler",
				"src/handlers.ts:logError",
			);

			expect(paths.length).toBeGreaterThan(0);
			expect(paths[0]?.nodes).toHaveLength(2);
			expect(paths[0]?.edges[0]?.type).toBe("REFERENCES");
		});

		it("finds path: createProcessor → transformItem (via return reference)", () => {
			const paths = queryPath(
				db,
				"src/factory.ts:createProcessor",
				"src/handlers.ts:transformItem",
			);

			expect(paths.length).toBeGreaterThan(0);
			expect(paths[0]?.nodes).toHaveLength(2);
			expect(paths[0]?.edges[0]?.type).toBe("REFERENCES");
		});
	});

	/**
	 * Path finding through variable assignment REFERENCES.
	 *
	 * Pattern: alias variable → original function
	 * Example: validate = validateInput
	 */
	describe("variable assignment paths", () => {
		it("finds path: validate → validateInput (via assignment)", () => {
			const paths = queryPath(
				db,
				"src/aliases.ts:validate",
				"src/handlers.ts:validateInput",
			);

			expect(paths.length).toBeGreaterThan(0);
			expect(paths[0]?.nodes).toHaveLength(2);
			expect(paths[0]?.edges[0]?.type).toBe("REFERENCES");
		});

		it("finds path: format → formatOutput (via assignment)", () => {
			const paths = queryPath(
				db,
				"src/aliases.ts:format",
				"src/handlers.ts:formatOutput",
			);

			expect(paths.length).toBeGreaterThan(0);
			expect(paths[0]?.nodes).toHaveLength(2);
			expect(paths[0]?.edges[0]?.type).toBe("REFERENCES");
		});
	});

	/**
	 * Multi-hop path finding through REFERENCES chains.
	 *
	 * This is the KEY use case: tracing through intermediate storage.
	 *
	 * Pattern: function → variable → stored function
	 * Example: dispatch → userFormatters → formatCustomer
	 *
	 * This enables answering: "What functions can dispatch eventually reach?"
	 */
	describe("multi-hop chains (function → variable → function)", () => {
		it("finds 2-hop path: dispatch → userFormatters → formatCustomer", () => {
			const paths = queryPath(
				db,
				"src/dispatcher.ts:dispatch",
				"src/dispatcher.ts:formatCustomer",
			);

			expect(paths.length).toBeGreaterThan(0);
			expect(paths[0]?.nodes).toHaveLength(3);
			expect(paths[0]?.nodes).toEqual([
				"src/dispatcher.ts:dispatch",
				"src/dispatcher.ts:userFormatters",
				"src/dispatcher.ts:formatCustomer",
			]);
			expect(paths[0]?.edges).toHaveLength(2);
			expect(paths[0]?.edges.every((e) => e.type === "REFERENCES")).toBe(true);
		});

		it("finds 2-hop path: dispatch → userFormatters → formatAdmin", () => {
			const paths = queryPath(
				db,
				"src/dispatcher.ts:dispatch",
				"src/dispatcher.ts:formatAdmin",
			);

			expect(paths.length).toBeGreaterThan(0);
			expect(paths[0]?.nodes).toHaveLength(3);
			expect(paths[0]?.nodes[0]).toBe("src/dispatcher.ts:dispatch");
			expect(paths[0]?.nodes[1]).toBe("src/dispatcher.ts:userFormatters");
			expect(paths[0]?.nodes[2]).toBe("src/dispatcher.ts:formatAdmin");
		});

		it("finds 2-hop path: getFormatter → userFormatters → formatCustomer", () => {
			const paths = queryPath(
				db,
				"src/dispatcher.ts:getFormatter",
				"src/dispatcher.ts:formatCustomer",
			);

			expect(paths.length).toBeGreaterThan(0);
			expect(paths[0]?.nodes).toHaveLength(3);
			expect(paths[0]?.nodes[1]).toBe("src/dispatcher.ts:userFormatters");
		});

		it("finds 2-hop path: getFormatter → userFormatters → formatAdmin", () => {
			const paths = queryPath(
				db,
				"src/dispatcher.ts:getFormatter",
				"src/dispatcher.ts:formatAdmin",
			);

			expect(paths.length).toBeGreaterThan(0);
			expect(paths[0]?.nodes).toHaveLength(3);
			expect(paths[0]?.nodes[0]).toBe("src/dispatcher.ts:getFormatter");
			expect(paths[0]?.nodes[1]).toBe("src/dispatcher.ts:userFormatters");
			expect(paths[0]?.nodes[2]).toBe("src/dispatcher.ts:formatAdmin");
		});
	});

	/**
	 * Path finding through object property REFERENCES.
	 *
	 * Pattern: variable → object property → stored function
	 * Example: userFormatters stores { customer: formatCustomer }
	 */
	describe("object property paths", () => {
		it("finds path: userFormatters → formatCustomer (via object property)", () => {
			const paths = queryPath(
				db,
				"src/dispatcher.ts:userFormatters",
				"src/dispatcher.ts:formatCustomer",
			);

			expect(paths.length).toBeGreaterThan(0);
			expect(paths[0]?.nodes).toHaveLength(2);
			expect(paths[0]?.edges[0]?.type).toBe("REFERENCES");
		});

		it("finds path: userFormatters → formatAdmin (via object property)", () => {
			const paths = queryPath(
				db,
				"src/dispatcher.ts:userFormatters",
				"src/dispatcher.ts:formatAdmin",
			);

			expect(paths.length).toBeGreaterThan(0);
			expect(paths[0]?.nodes).toHaveLength(2);
			expect(paths[0]?.edges[0]?.type).toBe("REFERENCES");
		});
	});
});
