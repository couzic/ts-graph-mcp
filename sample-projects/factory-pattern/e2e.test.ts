import type { Database } from "better-sqlite3";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { ProjectConfig } from "../../http/src/config/Config.schemas.js";
import { createSqliteWriter } from "../../http/src/db/sqlite/createSqliteWriter.js";
import {
  closeDatabase,
  openDatabase,
} from "../../http/src/db/sqlite/sqliteConnection.utils.js";
import { initializeSchema } from "../../http/src/db/sqlite/sqliteSchema.utils.js";
import { createFakeEmbeddingProvider } from "../../http/src/embedding/createFakeEmbeddingProvider.js";
import { indexProject } from "../../http/src/ingestion/indexProject.js";
import { silentLogger } from "../../http/src/logging/SilentTsGraphLogger.js";
import { dependenciesOf } from "../../http/src/query/dependencies-of/dependenciesOf.js";
import { createSearchIndex } from "../../http/src/search/createSearchIndex.js";

/**
 * E2E tests for factory function pattern.
 *
 * Factory: createService = () => ({ fetchAll: () => loadData(), fetchById: (id) => ... })
 * Alias: type Service = ReturnType<typeof createService>
 * Caller: handleRequest() calls createService() then service.fetchAll()
 *
 * Tests that:
 * - Factory-returned methods produce correct CALLS edges (not dangling)
 * - Calls inside factory methods are attributed to the method, not the factory
 * - Display names use alias simplification (Service.fetchAll, not ReturnType<typeof createService>.fetchAll)
 */
describe("factory pattern E2E tests", () => {
  let db: Database;

  beforeAll(async () => {
    db = openDatabase({ path: ":memory:" });
    initializeSchema(db);

    const projectRoot = import.meta.dirname;
    const config: ProjectConfig = {
      packages: [{ name: "main", tsconfig: "tsconfig.json" }],
    };
    const writer = createSqliteWriter(db);
    const embeddingProvider = createFakeEmbeddingProvider({ dimensions: 3 });
    const searchIndex = await createSearchIndex({ vectorDimensions: 3 });
    await indexProject(config, writer, {
      projectRoot,
      logger: silentLogger,
      embeddingProvider,
      searchIndex,
    });
  });

  afterAll(() => {
    closeDatabase(db);
  });

  describe("dependenciesOf", () => {
    it("traces through factory-returned methods with alias simplification", () => {
      const output = dependenciesOf(db, "src/handler.ts", "handleRequest");

      expect(output).toBe(`## Graph

handleRequest --CALLS--> createService --RETURNS--> Service
handleRequest --CALLS--> Service.fetchAll --CALLS--> loadData

## Nodes

createService:
  type: Function
  file: src/createService.ts
  offset: 3, limit: 8
  snippet:
    3: export const createService = () => ({
    4:   fetchAll: () => {
    5:     return loadData();
    6:   },
    7:   fetchById: (id: string) => {
    8:     return loadData().find((item) => item.id === id);
    9:   },
    10: });

Service:
  type: SyntheticType
  file: src/createService.ts
  offset: 3, limit: 8
  snippet:
    3: export const createService = () => ({
    4:   fetchAll: () => {
    5:     return loadData();
    6:   },
    7:   fetchById: (id: string) => {
    8:     return loadData().find((item) => item.id === id);
    9:   },
    10: });

Service.fetchAll:
  type: Function
  file: src/createService.ts
  offset: 4, limit: 3
  snippet:
    4:   fetchAll: () => {
  > 5:     return loadData();
    6:   },

loadData:
  type: Function
  file: src/loadData.ts
  offset: 1, limit: 6
  snippet:
    1: export const loadData = () => {
    2:   return [
    3:     { id: "1", name: "Alice" },
    4:     { id: "2", name: "Bob" },
    5:   ];
    6: };
`);
    });
  });
});
