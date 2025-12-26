import type Database from "better-sqlite3";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { normalizeConfig } from "../../src/config/defineConfig.js";
// Setup helpers only
import { queryNodes } from "../../src/db/queryNodes.js";
import { createSqliteWriter } from "../../src/db/sqlite/createSqliteWriter.js";
import {
  closeDatabase,
  openDatabase,
} from "../../src/db/sqlite/sqliteConnection.utils.js";
import { initializeSchema } from "../../src/db/sqlite/sqliteSchema.utils.js";
import { indexProject } from "../../src/ingestion/indexProject.js";
import { queryImpactedNodes } from "../../src/tools/analyze-impact/query.js";
import { queryPath } from "../../src/tools/find-paths/query.js";
import { queryCallers } from "../../src/tools/incoming-calls-deep/query.js";
import { queryIncomingPackageDeps } from "../../src/tools/incoming-package-deps/query.js";
// Tool query functions (actual E2E tests)
import { queryCallees } from "../../src/tools/outgoing-calls-deep/query.js";
import { queryPackageDeps } from "../../src/tools/outgoing-package-deps/query.js";

/**
 * E2E tests for web-app sample project.
 *
 * Structure (flat packages format - single "main" module):
 * - shared package: User, Config interfaces + createUser function
 * - frontend package: UserCard.ts imports User from shared
 * - backend package: userApi.ts imports User, Config and calls createUser from shared
 *
 * PURPOSE: Test MCP tool query functions against a cross-package codebase.
 * These tests verify actual tool behavior, not AST extraction.
 */
describe.skip("web-app e2e", () => {
  let db: Database.Database;

  beforeAll(async () => {
    db = openDatabase({ path: ":memory:" });
    initializeSchema(db);
    // Note: web-app uses flat packages format (array of packages without modules wrapper)
    // normalizeConfig converts it to full format with implicit "main" module
    const config = normalizeConfig({
      packages: [
        { name: "shared", tsconfig: "./shared/tsconfig.json" },
        { name: "frontend", tsconfig: "./frontend/tsconfig.json" },
        { name: "backend", tsconfig: "./backend/tsconfig.json" },
      ],
    });
    const writer = createSqliteWriter(db);
    await indexProject(config, writer, { projectRoot: import.meta.dirname });
  });

  afterAll(() => closeDatabase(db));

  function findNodeByPackage(name: string, pkg: string) {
    return queryNodes(db, name, { package: pkg })[0];
  }

  describe(queryPackageDeps.name, () => {
    it("backend depends on shared", () => {
      // Backend imports from shared (User, Config, createUser)
      const result = queryPackageDeps(db, "main", "backend");

      expect(result.packages.length).toBeGreaterThan(0);
      expect(result.packages.some((p) => p.package === "shared")).toBe(true);
    });

    it("frontend depends on shared", () => {
      // Frontend imports User type from shared
      const result = queryPackageDeps(db, "main", "frontend");

      expect(result.packages.length).toBeGreaterThan(0);
      expect(result.packages.some((p) => p.package === "shared")).toBe(true);
    });

    it("shared has no dependencies", () => {
      // Shared is a leaf package
      const result = queryPackageDeps(db, "main", "shared");

      expect(result.packages.length).toBe(0);
      expect(result.dependencies.length).toBe(0);
    });

    it("respects maxDepth=1 for direct deps only", () => {
      const result = queryPackageDeps(db, "main", "backend", 1);

      // Should only show direct dependencies
      expect(result.packages.every((p) => p.depth === 1)).toBe(true);
    });
  });

  describe(queryIncomingPackageDeps.name, () => {
    it("shared is depended on by frontend and backend", () => {
      const result = queryIncomingPackageDeps(db, {
        package: "shared",
        maxDepth: 5,
      });

      expect(result.centerExists).toBe(true);
      // Filter out the center package (depth 0) to get only dependents
      const dependents = result.packages.filter((p) => p.depth > 0);

      expect(dependents.some((p) => p.package === "frontend")).toBe(true);
      expect(dependents.some((p) => p.package === "backend")).toBe(true);
    });

    it("backend has no reverse dependencies", () => {
      // Nothing imports from backend
      const result = queryIncomingPackageDeps(db, {
        package: "backend",
        maxDepth: 5,
      });

      expect(result.centerExists).toBe(true);
      // Only the center package (depth 0) should exist
      const dependents = result.packages.filter((p) => p.depth > 0);
      expect(dependents.length).toBe(0);
    });

    it("frontend has no reverse dependencies", () => {
      // Nothing imports from frontend
      const result = queryIncomingPackageDeps(db, {
        package: "frontend",
        maxDepth: 5,
      });

      expect(result.centerExists).toBe(true);
      const dependents = result.packages.filter((p) => p.depth > 0);
      expect(dependents.length).toBe(0);
    });
  });

  describe(queryImpactedNodes.name, () => {
    it("changing User interface impacts frontend dependents", () => {
      const userNode = findNodeByPackage("User", "shared");
      expect(userNode).toBeDefined();

      const impacted = queryImpactedNodes(db, userNode?.id, { maxDepth: 5 });

      const frontendImpacted = impacted.filter((n) => n.package === "frontend");
      // formatUserName directly uses User type in its parameter
      expect(frontendImpacted.map((n) => n.name)).toContain("formatUserName");
    });

    it("changing User interface impacts backend functions", () => {
      const userNode = findNodeByPackage("User", "shared");
      expect(userNode).toBeDefined();

      const impacted = queryImpactedNodes(db, userNode?.id, { maxDepth: 5 });

      const impactedNames = impacted.map((n) => n.name);
      // Backend functions that use User type
      expect(impactedNames).toContain("getUser");
      expect(impactedNames).toContain("listUsers");
    });

    it("changing User interface impacts BOTH frontend AND backend packages", () => {
      const userNode = findNodeByPackage("User", "shared");
      expect(userNode).toBeDefined();

      const impacted = queryImpactedNodes(db, userNode?.id, { maxDepth: 5 });
      const packages = [...new Set(impacted.map((n) => n.package))];

      // Key assertion: Impact crosses package boundaries
      expect(packages).toContain("frontend");
      expect(packages).toContain("backend");
    });

    it("changing createUser function impacts backend callers", () => {
      const createUserNode = findNodeByPackage("createUser", "shared");
      expect(createUserNode).toBeDefined();

      const impacted = queryImpactedNodes(db, createUserNode?.id, {
        maxDepth: 5,
      });

      const impactedNames = impacted.map((n) => n.name);
      // Backend functions that call createUser
      expect(impactedNames).toContain("getUser");
      expect(impactedNames).toContain("listUsers");
    });

    it("changing Config interface impacts backend functions", () => {
      const configNode = findNodeByPackage("Config", "shared");
      expect(configNode).toBeDefined();

      const impacted = queryImpactedNodes(db, configNode?.id, { maxDepth: 5 });

      const impactedNames = impacted.map((n) => n.name);
      expect(impactedNames).toContain("getConfig");
    });
  });

  describe(queryPath.name, () => {
    it("finds path from getUser to createUser (backend -> shared)", () => {
      const getUser = findNodeByPackage("getUser", "backend");
      const createUser = findNodeByPackage("createUser", "shared");

      expect(getUser).toBeDefined();
      expect(createUser).toBeDefined();

      const paths = queryPath(db, getUser?.id, createUser?.id);

      expect(paths.length).toBeGreaterThan(0);
      expect(paths[0]?.nodes.length).toBe(2); // getUser -> createUser
      expect(paths[0]?.nodes[0]).toBe(getUser?.id);
      expect(paths[0]?.nodes[1]).toBe(createUser?.id);
    });

    it("finds path from listUsers to createUser (backend -> shared)", () => {
      const listUsers = findNodeByPackage("listUsers", "backend");
      const createUser = findNodeByPackage("createUser", "shared");

      expect(listUsers).toBeDefined();
      expect(createUser).toBeDefined();

      const paths = queryPath(db, listUsers?.id, createUser?.id);

      expect(paths.length).toBeGreaterThan(0);
      expect(paths[0]?.nodes.length).toBe(2); // listUsers -> createUser
    });

    it("returns empty array when no path exists", () => {
      // frontend functions don't call backend functions
      const formatUserName = findNodeByPackage("formatUserName", "frontend");
      const getUser = findNodeByPackage("getUser", "backend");

      expect(formatUserName).toBeDefined();
      expect(getUser).toBeDefined();

      const paths = queryPath(db, formatUserName?.id, getUser?.id);

      expect(paths).toEqual([]);
    });
  });

  describe(queryCallers.name, () => {
    it("finds backend callers of createUser", () => {
      const createUser = findNodeByPackage("createUser", "shared");
      expect(createUser).toBeDefined();

      const callers = queryCallers(db, createUser?.id, { maxDepth: 5 });

      const callerNames = callers.map((n) => n.name);
      expect(callerNames).toContain("getUser");
      expect(callerNames).toContain("listUsers");
    });

    it("callers are from backend package", () => {
      const createUser = findNodeByPackage("createUser", "shared");
      expect(createUser).toBeDefined();

      const callers = queryCallers(db, createUser?.id, { maxDepth: 5 });

      // All callers should be from backend (frontend doesn't call createUser)
      expect(callers.every((n) => n.package === "backend")).toBe(true);
    });

    it("createUser has no callers in shared package", () => {
      const createUser = findNodeByPackage("createUser", "shared");
      expect(createUser).toBeDefined();

      const callers = queryCallers(db, createUser?.id, { maxDepth: 5 });

      // No callers from shared (it's the source package)
      expect(callers.some((n) => n.package === "shared")).toBe(false);
    });
  });

  describe(queryCallees.name, () => {
    it("getUser calls createUser", () => {
      const getUser = findNodeByPackage("getUser", "backend");
      expect(getUser).toBeDefined();

      const callees = queryCallees(db, getUser?.id);

      const calleeNames = callees.map((n) => n.name);
      expect(calleeNames).toContain("createUser");
    });

    it("listUsers calls createUser", () => {
      const listUsers = findNodeByPackage("listUsers", "backend");
      expect(listUsers).toBeDefined();

      const callees = queryCallees(db, listUsers?.id);

      const calleeNames = callees.map((n) => n.name);
      expect(calleeNames).toContain("createUser");
    });

    it("getConfig has no callees", () => {
      const getConfig = findNodeByPackage("getConfig", "backend");
      expect(getConfig).toBeDefined();

      const callees = queryCallees(db, getConfig?.id);

      // getConfig just returns defaultConfig, no function calls
      expect(callees.length).toBe(0);
    });

    it("callees are from shared package", () => {
      const getUser = findNodeByPackage("getUser", "backend");
      expect(getUser).toBeDefined();

      const callees = queryCallees(db, getUser?.id);

      // getUser's callees should be from shared (createUser)
      expect(callees.some((n) => n.package === "shared")).toBe(true);
    });
  });
});
