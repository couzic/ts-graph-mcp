import type { Database } from "better-sqlite3";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadConfig } from "../../http/src/config/configLoader.utils.js";
import { createSqliteWriter } from "../../http/src/db/sqlite/createSqliteWriter.js";
import {
  closeDatabase,
  openDatabase,
} from "../../http/src/db/sqlite/sqliteConnection.utils.js";
import { initializeSchema } from "../../http/src/db/sqlite/sqliteSchema.utils.js";
import { indexProject } from "../../http/src/ingestion/indexProject.js";
import { dependenciesOf } from "../../http/src/query/dependencies-of/dependenciesOf.js";
import { dependentsOf } from "../../http/src/query/dependents-of/dependentsOf.js";

/**
 * E2E tests for path-aliases sample project.
 *
 * Tests transparent re-exports through barrel files with path aliases.
 *
 * Design principle: Barrel files are INVISIBLE in the graph.
 * - No nodes for re-exported symbols
 * - Edges go directly to actual definitions
 * - Barrel files don't show up as dependents
 *
 * Structure:
 * - src/index.ts: barrel file re-exporting via path alias (@/utils/helper)
 * - src/utils/helper.ts: actual implementation
 * - src/consumer.ts: imports from barrel and calls the function
 */
describe("path-aliases E2E tests", () => {
  let db: Database;
  let projectRoot: string;

  beforeAll(async () => {
    db = openDatabase({ path: ":memory:" });
    initializeSchema(db);

    projectRoot = import.meta.dirname;
    const config = loadConfig(`${projectRoot}/ts-graph-mcp.config.json`);
    const writer = createSqliteWriter(db);
    await indexProject(config, writer, { projectRoot });
  });

  afterAll(() => {
    closeDatabase(db);
  });

  describe("transparent re-exports", () => {
    it("CALLS edge goes directly to actual definition, not barrel file", () => {
      // consumer.ts imports from barrel (index.ts) and calls formatValue
      // The CALLS edge should go directly to helper.ts:formatValue
      const output = dependenciesOf(
        db,
        projectRoot,
        "src/consumer.ts",
        "displayValue",
      );

      // Edge skips barrel file, points directly to actual definition
      expect(output).toContain("src/utils/helper.ts");
      expect(output).toContain("formatValue");
      // Barrel file should NOT appear
      expect(output).not.toContain("src/index.ts");
    });

    it("finds real callers, not barrel files, as dependents", () => {
      // helper.ts:formatValue is called by consumer.ts
      // index.ts re-exports it but should NOT appear as dependent
      const output = dependentsOf(
        db,
        projectRoot,
        "src/utils/helper.ts",
        "formatValue",
      );

      // consumer.ts is a real caller
      expect(output).toContain("src/consumer.ts");
      expect(output).toContain("displayValue");
      // Barrel file should NOT appear as dependent
      expect(output).not.toContain("src/index.ts");
    });
  });

  describe("barrel file invisibility", () => {
    it("querying re-exported symbol at barrel file auto-resolves to actual definition", () => {
      // Barrel files have no symbol nodes - re-exports are invisible
      // When querying at barrel file, symbol auto-resolves to actual definition
      const output = dependenciesOf(
        db,
        projectRoot,
        "src/index.ts",
        "formatValue",
      );

      // Auto-resolve finds the actual definition
      expect(output).toContain("Resolved 'formatValue' to src/utils/helper.ts");
    });
  });
});
