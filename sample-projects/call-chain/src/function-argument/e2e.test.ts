import { join } from "node:path";
import type { Database } from "better-sqlite3";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { ProjectConfig } from "../../../../http/src/config/Config.schemas.js";
import { createSqliteWriter } from "../../../../http/src/db/sqlite/createSqliteWriter.js";
import {
  closeDatabase,
  openDatabase,
} from "../../../../http/src/db/sqlite/sqliteConnection.utils.js";
import { initializeSchema } from "../../../../http/src/db/sqlite/sqliteSchema.utils.js";
import { indexProject } from "../../../../http/src/ingestion/indexProject.js";
import { dependenciesOf } from "../../../../http/src/query/dependencies-of/dependenciesOf.js";
import { dependentsOf } from "../../../../http/src/query/dependents-of/dependentsOf.js";
import { pathsBetween } from "../../../../http/src/query/paths-between/pathsBetween.js";

/**
 * E2E tests for function passed as argument (callback pattern).
 *
 * Pattern: orchestrate(items, processor)
 *
 * Chain: entry → orchestrate → transform → validate
 * The processor callback is passed through the chain via REFERENCES edges.
 */
describe("function-argument E2E tests", () => {
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
    it("finds dependencies of entry()", () => {
      const output = dependenciesOf(
        db,
        projectRoot,
        "src/function-argument/entry.ts",
        "entry",
      );

      expect(output).toBe(
        `
## Graph

entry --CALLS--> orchestrate --CALLS--> transform --CALLS--> validate
entry --REFERENCES--> processor

## Nodes

orchestrate:
  type: Function
  file: src/function-argument/handlers/orchestrate.ts
  offset: 4, limit: 6
  snippet:
    4: export function orchestrate(
    5:   items: string[],
    6:   callback: (value: string) => string,
    7: ): string[] {
  > 8:   return transform(items, callback);
    9: }

transform:
  type: Function
  file: src/function-argument/core/transform.ts
  offset: 4, limit: 7
  snippet:
    4: export function transform(
    5:   items: string[],
    6:   callback: (value: string) => string,
    7: ): string[] {
    8:   const trimmed = items.map((item) => item.trim());
  > 9:   return validate(trimmed, callback);
    10: }

validate:
  type: Function
  file: src/function-argument/utils/validate.ts
  offset: 2, limit: 6
  snippet:
    2: export function validate(
    3:   items: string[],
    4:   callback: (value: string) => string,
    5: ): string[] {
    6:   return items.filter((item) => item.length > 0).map(callback);
    7: }

processor:
  type: Function
  file: src/function-argument/lib/processor.ts
  offset: 2, limit: 3
  snippet:
    2: export function processor(value: string): string {
    3:   return value.toUpperCase();
    4: }
`.trimStart(),
      );
    });
  });

  describe("dependentsOf", () => {
    it("finds entry as dependent of processor", () => {
      const output = dependentsOf(
        db,
        projectRoot,
        "src/function-argument/lib/processor.ts",
        "processor",
      );

      expect(output).toBe(
        `
## Graph

entry --REFERENCES--> processor

## Nodes

entry:
  type: Function
  file: src/function-argument/entry.ts
  offset: 5, limit: 4
  snippet:
    5: export function entry(): string[] {
    6:   const items = ["hello", "world", ""];
    7:   return orchestrate(items, processor);
    8: }
`.trimStart(),
      );
    });
  });

  describe("pathsBetween", () => {
    it("finds path from entry to processor", () => {
      const output = pathsBetween(
        db,
        projectRoot,
        { file_path: "src/function-argument/entry.ts", symbol: "entry" },
        {
          file_path: "src/function-argument/lib/processor.ts",
          symbol: "processor",
        },
      );

      expect(output).toBe(
        `
## Graph

entry --REFERENCES--> processor
`.trim(),
      );
    });
  });
});
