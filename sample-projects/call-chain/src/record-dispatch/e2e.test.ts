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
import { dependentsOf } from "../../../../src/tools/dependents-of/dependentsOf.js";
import { pathsBetween } from "../../../../src/tools/paths-between/pathsBetween.js";

/**
 * E2E tests for Record dispatch pattern.
 *
 * Pattern: const handlers: Record<Key, Function> = { key: fn }
 *          export function dispatch(key) { return handlers[key](...) }
 *
 * Expected graph:
 * formatErrorMessage --REFERENCES--> formatMessageByAccessLevel
 *                                     --REFERENCES--> formatCustomerError
 *                                     --REFERENCES--> formatAdminError
 */
describe("record-dispatch E2E tests", () => {
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
    it("finds formatters via Record dispatch", () => {
      const output = dependenciesOf(
        db,
        projectRoot,
        "src/record-dispatch/formatErrorMessage.ts",
        "formatErrorMessage",
      );

      expect(output).toBe(`## Graph

formatErrorMessage --REFERENCES--> formatMessageByAccessLevel --REFERENCES--> formatCustomerError
formatMessageByAccessLevel --REFERENCES--> formatAdminError

## Nodes

formatMessageByAccessLevel:
  file: src/record-dispatch/formatErrorMessage.ts
  offset: 20, limit: 7
  snippet:
    20: const formatMessageByAccessLevel: Record<
    21:   AccessLevel,
    22:   (error: Error) => string
    23: > = {
    24:   customer: formatCustomerError,
    25:   admin: formatAdminError,
    26: };

formatCustomerError:
  file: src/record-dispatch/formatCustomerError.ts
  offset: 1, limit: 3
  snippet:
    1: export function formatCustomerError(error: Error): string {
    2:   return \`Sorry, something went wrong: \${error.message}\`;
    3: }

formatAdminError:
  file: src/record-dispatch/formatAdminError.ts
  offset: 1, limit: 3
  snippet:
    1: export function formatAdminError(error: Error): string {
    2:   return \`[ADMIN] Error: \${error.name} - \${error.message}\\n\${error.stack}\`;
    3: }
`);
    });
  });

  describe("dependentsOf", () => {
    it("finds dispatch function as dependent of formatter", () => {
      const output = dependentsOf(
        db,
        projectRoot,
        "src/record-dispatch/formatCustomerError.ts",
        "formatCustomerError",
      );

      expect(output).toBe(`## Graph

formatErrorMessage --REFERENCES--> formatMessageByAccessLevel --REFERENCES--> formatCustomerError

## Nodes

formatErrorMessage:
  file: src/record-dispatch/formatErrorMessage.ts
  offset: 28, limit: 6
  snippet:
    28: export function formatErrorMessage(
    29:   accessLevel: AccessLevel,
    30:   error: Error,
    31: ): string {
    32:   return formatMessageByAccessLevel[accessLevel](error);
    33: }

formatMessageByAccessLevel:
  file: src/record-dispatch/formatErrorMessage.ts
  offset: 20, limit: 7
  snippet:
    20: const formatMessageByAccessLevel: Record<
    21:   AccessLevel,
    22:   (error: Error) => string
    23: > = {
    24:   customer: formatCustomerError,
    25:   admin: formatAdminError,
    26: };
`);
    });
  });

  describe("pathsBetween", () => {
    it("finds path from dispatch to formatter via Record", () => {
      const output = pathsBetween(
        db,
        projectRoot,
        {
          file_path: "src/record-dispatch/formatErrorMessage.ts",
          symbol: "formatErrorMessage",
        },
        {
          file_path: "src/record-dispatch/formatCustomerError.ts",
          symbol: "formatCustomerError",
        },
      );

      expect(output).toBe(`## Graph

formatErrorMessage --REFERENCES--> formatMessageByAccessLevel --REFERENCES--> formatCustomerError

## Nodes

formatMessageByAccessLevel:
  file: src/record-dispatch/formatErrorMessage.ts
  offset: 20, limit: 7
  snippet:
    20: const formatMessageByAccessLevel: Record<
    21:   AccessLevel,
    22:   (error: Error) => string
    23: > = {
    24:   customer: formatCustomerError,
    25:   admin: formatAdminError,
    26: };
`);
    });
  });
});
