import { join } from "node:path";
import type { Database } from "better-sqlite3";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { ProjectConfig } from "../../../../src/config/Config.schemas.js";
import { createSqliteWriter } from "../../../../src/db/sqlite/createSqliteWriter.js";
import {
  closeDatabase,
  openDatabase,
} from "../../../../src/db/sqlite/sqliteConnection.utils.js";
import { initializeSchema } from "../../../../src/db/sqlite/sqliteSchema.utils.js";
import { indexProject } from "../../../../src/ingestion/indexProject.js";
import { dependenciesOf } from "../../../../src/tools/dependencies-of/dependenciesOf.js";

describe("small gaps E2E - gap indicator threshold", () => {
  let db: Database;
  let projectRoot: string;

  beforeAll(async () => {
    db = openDatabase({ path: ":memory:" });
    initializeSchema(db);

    projectRoot = join(import.meta.dirname, "../..");
    const config: ProjectConfig = {
      packages: [{ name: "main", tsconfig: "tsconfig.json" }],
    };
    const writer = createSqliteWriter(db);
    await indexProject(config, writer, { projectRoot });
  });

  afterAll(() => {
    closeDatabase(db);
  });

  describe("dependenciesOf", () => {
    it("shows actual lines for small gaps instead of gap indicator", () => {
      const output = dependenciesOf(
        db,
        projectRoot,
        "src/small-gaps/entry.ts",
        "entry",
      );

      // With 27+ nodes, contextLines=0, so caller's snippet shows only call sites.
      // Call sites on lines 9, 11, 13 produce gaps of 1 and 1 lines.
      // These should NOT show "... 1 lines omitted ..." indicators.
      expect(output).not.toContain("... 1 lines omitted ...");
      expect(output).not.toContain("... 2 lines omitted ...");

      // Should still show gap indicators for larger gaps (3+ lines)
      // The caller function has a 3+ line gap between signature and first call
      // (This test will pass once the fix is implemented)
    });
  });
});
