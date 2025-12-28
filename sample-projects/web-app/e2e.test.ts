import type { Database } from "better-sqlite3";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadConfig } from "../../src/config/configLoader.utils.js";
import { createSqliteWriter } from "../../src/db/sqlite/createSqliteWriter.js";
import {
  closeDatabase,
  openDatabase,
} from "../../src/db/sqlite/sqliteConnection.utils.js";
import { initializeSchema } from "../../src/db/sqlite/sqliteSchema.utils.js";
import { indexProject } from "../../src/ingestion/indexProject.js";
import { dependenciesOf } from "../../src/tools/dependencies-of/dependenciesOf.js";
import { dependentsOf } from "../../src/tools/dependents-of/dependentsOf.js";
import { pathsBetween } from "../../src/tools/paths-between/pathsBetween.js";

/**
 * E2E tests for web-app sample project (multi-package).
 *
 * Structure:
 * - shared/src/common.ts: User interface, Config interface, createUser function
 * - frontend/src/UserCard.ts: renderUserCard, formatUserName (uses User type)
 * - backend/src/userApi.ts: getUser, listUsers, getConfig (calls createUser)
 *
 * Tests cross-package CALLS edges (backend → shared).
 */
describe("web-app multi-package E2E tests", () => {
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

  describe("dependenciesOf", () => {
    it("finds cross-package CALLS from backend to shared", () => {
      const output = dependenciesOf(
        db,
        projectRoot,
        "backend/src/userApi.ts",
        "getUser",
      );

      expect(output).toBe(
        `
## Graph

getUser --CALLS--> createUser

## Nodes

createUser:
  file: shared/src/common.ts
  offset: 18, limit: 8
  snippet:
    18: export function createUser(name: string, email: string): User {
    19:   return {
    20:     id: crypto.randomUUID(),
    21:     name,
    22:     email,
    23:     createdAt: new Date(),
    24:   };
    25: }
`.trimStart(),
      );
    });

    it("returns empty for shared function with no outgoing calls", () => {
      const output = dependenciesOf(
        db,
        projectRoot,
        "shared/src/common.ts",
        "createUser",
      );

      expect(output).toBe(`No dependencies found.`);
    });
  });

  describe("dependentsOf", () => {
    it("finds cross-package callers of shared createUser function", () => {
      const output = dependentsOf(
        db,
        projectRoot,
        "shared/src/common.ts",
        "createUser",
      );

      expect(output).toBe(
        `
## Graph

getUser --CALLS--> createUser
listUsers --CALLS--> createUser

## Nodes

getUser:
  file: backend/src/userApi.ts
  offset: 15, limit: 7
  snippet:
    15: export function getUser(id: string): User | null {
    16:   // Simulated database lookup
    17:   if (id === "1") {
  > 18:     return createUser("John Doe", "john@example.com");
    19:   }
    20:   return null;
    21: }

listUsers:
  file: backend/src/userApi.ts
  offset: 23, limit: 6
  snippet:
    23: export function listUsers(): User[] {
    24:   return [
  > 25:     createUser("Alice", "alice@example.com"),
  > 26:     createUser("Bob", "bob@example.com"),
    27:   ];
    28: }
`.trimStart(),
      );
    });

    it("returns empty for entry point with no callers", () => {
      const output = dependentsOf(
        db,
        projectRoot,
        "backend/src/userApi.ts",
        "getUser",
      );

      expect(output).toBe(`No dependents found.`);
    });
  });

  describe("pathsBetween", () => {
    it("finds path from backend function to shared function", () => {
      const output = pathsBetween(
        db,
        projectRoot,
        { file_path: "backend/src/userApi.ts", symbol: "getUser" },
        { file_path: "shared/src/common.ts", symbol: "createUser" },
      );

      // Direct CALLS edge, no intermediate nodes (pathsBetween omits snippets for direct edges)
      expect(output).toBe(
        `
## Graph

getUser --CALLS--> createUser
`.trim(),
      );
    });

    it("returns no path for unconnected symbols", () => {
      const output = pathsBetween(
        db,
        projectRoot,
        { file_path: "frontend/src/UserCard.ts", symbol: "renderUserCard" },
        { file_path: "backend/src/userApi.ts", symbol: "getUser" },
      );

      // Frontend and backend don't have direct call edges between them
      expect(output).toBe(`No path found.`);
    });

    it("returns error for same node", () => {
      const output = pathsBetween(
        db,
        projectRoot,
        { file_path: "shared/src/common.ts", symbol: "createUser" },
        { file_path: "shared/src/common.ts", symbol: "createUser" },
      );

      expect(output).toBe(
        `Invalid query: source and target are the same symbol.`,
      );
    });
  });
});
