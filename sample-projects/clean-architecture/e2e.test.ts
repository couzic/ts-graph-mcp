import type { Database } from "better-sqlite3";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { ProjectConfig } from "../../http/src/config/Config.schemas.js";
import { createSqliteWriter } from "../../http/src/db/sqlite/createSqliteWriter.js";
import {
  closeDatabase,
  openDatabase,
} from "../../http/src/db/sqlite/sqliteConnection.utils.js";
import { initializeSchema } from "../../http/src/db/sqlite/sqliteSchema.utils.js";
import { indexProject } from "../../http/src/ingestion/indexProject.js";
import { dependenciesOf } from "../../http/src/query/dependencies-of/dependenciesOf.js";
import { dependentsOf } from "../../http/src/query/dependents-of/dependentsOf.js";
import { pathsBetween } from "../../http/src/query/paths-between/pathsBetween.js";

/**
 * Tests class method fallback and disambiguation behavior.
 */
describe("clean-architecture E2E tests", () => {
  let db: Database;
  let projectRoot: string;

  beforeAll(async () => {
    db = openDatabase({ path: ":memory:" });
    initializeSchema(db);

    projectRoot = import.meta.dirname;
    const config: ProjectConfig = {
      packages: [{ name: "main", tsconfig: "tsconfig.json" }],
    };
    const writer = createSqliteWriter(db);
    await indexProject(config, writer, { projectRoot });
  });

  afterAll(() => {
    closeDatabase(db);
  });

  describe("class method fallback", () => {
    /**
     * When querying a class that has no direct dependencies (classes don't CALL things),
     * but has exactly ONE method that does have dependencies, the tool should
     * automatically resolve to that method and return its dependencies.
     */
    it("auto-resolves single-method class to its method", () => {
      const output = dependenciesOf(
        db,
        projectRoot,
        "src/usecases/SetDefaultProviderCommand.ts",
        "SetDefaultProviderCommand",
      );

      // Should auto-resolve to SetDefaultProviderCommand.execute
      // and return the dependencies of that method
      expect(output).toContain(
        "Resolved 'SetDefaultProviderCommand' to SetDefaultProviderCommand.execute",
      );
      expect(output).toContain("## Graph");
      expect(output).toContain("SetDefaultProviderCommand.execute");
      expect(output).toContain("setAsDefault");
    });
  });

  describe("class method disambiguation", () => {
    /**
     * When querying a class that has no direct dependencies but has multiple methods,
     * the tool should return a disambiguation message listing the available methods
     * so the agent can retry with a fully qualified symbol name.
     */
    it("shows method disambiguation for multi-method class", () => {
      const output = dependenciesOf(
        db,
        projectRoot,
        "src/usecases/ManageProvidersCommand.ts",
        "ManageProvidersCommand",
      );

      expect(output).toContain("ManageProvidersCommand");
      expect(output).toContain("listAll");
      expect(output).toContain("enable");
      expect(output).toContain("disable");
      expect(output).toMatch(/retry with.*fully qualified/i);
    });
  });

  describe("dependentsOf class fallback", () => {
    /**
     * When querying dependents of a class with a single method,
     * the tool should auto-resolve to that method and find its callers.
     */
    it("auto-resolves single-method class to its method for dependents", () => {
      const output = dependentsOf(
        db,
        projectRoot,
        "src/usecases/SetDefaultProviderCommand.ts",
        "SetDefaultProviderCommand",
      );

      // Should auto-resolve to SetDefaultProviderCommand.execute
      expect(output).toContain(
        "Resolved 'SetDefaultProviderCommand' to SetDefaultProviderCommand.execute",
      );
      expect(output).toContain("## Graph");
      // AdminController and ProviderController both call execute()
      expect(output).toContain("AdminController");
      expect(output).toContain("ProviderController");
    });
  });

  describe("pathsBetween class fallback", () => {
    /**
     * Test class fallback for the 'to' endpoint.
     * When the target is a class with a single method,
     * auto-resolve to that method to find the path.
     */
    it("auto-resolves class in 'to' position", () => {
      const output = pathsBetween(
        db,
        projectRoot,
        {
          file_path: "src/controllers/AdminController.ts",
          symbol: "AdminController.configureProvider",
        },
        {
          file_path: "src/usecases/SetDefaultProviderCommand.ts",
          symbol: "SetDefaultProviderCommand",
        },
      );

      expect(output).toContain(
        "Resolved 'SetDefaultProviderCommand' to SetDefaultProviderCommand.execute",
      );
      expect(output).toContain("## Graph");
    });

    /**
     * Test class fallback for the 'from' endpoint.
     * When the source is a class with a single method,
     * auto-resolve to that method to find the path.
     *
     * Note: We use ProviderService (TypeAlias) as target since setAsDefault
     * is an inline method in the factory return object (no node exists for it).
     */
    it("auto-resolves class in 'from' position", () => {
      const output = pathsBetween(
        db,
        projectRoot,
        {
          file_path: "src/usecases/SetDefaultProviderCommand.ts",
          symbol: "SetDefaultProviderCommand",
        },
        {
          file_path: "src/services/ProviderService.ts",
          symbol: "ProviderService",
        },
      );

      expect(output).toContain(
        "Resolved 'SetDefaultProviderCommand' to SetDefaultProviderCommand.execute",
      );
    });
  });
});
