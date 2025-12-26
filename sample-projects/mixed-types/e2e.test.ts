import type Database from "better-sqlite3";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { ProjectConfig } from "../../src/config/Config.schemas.js";
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
// Tool query functions (actual E2E tests)
import { queryCallees } from "../../src/tools/outgoing-calls-deep/query.js";

/**
 * E2E tests for mixed-types test project.
 *
 * Tests MCP tool query functions against a codebase with:
 * - All 8 node types (Function, Class, Method, Interface, TypeAlias, Variable, Property, File)
 * - 3-level class hierarchy (AdminService -> UserService -> BaseService)
 * - Interface inheritance (Auditable -> Entity)
 * - Cross-file type usage (models.ts uses types from types.ts)
 * - IMPLEMENTS edges (AuditLog, ActivityLog implement Auditable)
 */
describe.skip("mixed-types e2e", () => {
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

  afterAll(() => {
    closeDatabase(db);
  });

  // Helper to find nodes (setup only, not part of E2E assertions)
  function findNode(name: string, type?: string) {
    const results = queryNodes(db, name, type ? { type } : undefined);
    return results[0];
  }

  describe(queryImpactedNodes.name, () => {
    it("finds UserService dependents when querying User interface", () => {
      const user = findNode("User", "Interface");
      expect(user).toBeDefined();

      const impacted = queryImpactedNodes(db, user!.id, { maxDepth: 5 });

      const impactedNames = impacted.map((n) => n.name);
      // User is used by UserService.addUser (parameter) and UserService.users (property)
      expect(impactedNames).toContain("addUser");
      expect(impactedNames).toContain("users");
    });

    it("finds all dependents of Entity interface through inheritance chain", () => {
      const entity = findNode("Entity", "Interface");
      expect(entity).toBeDefined();

      const impacted = queryImpactedNodes(db, entity!.id, { maxDepth: 5 });

      const impactedNames = impacted.map((n) => n.name);
      // Entity is extended by Auditable, which is implemented by AuditLog and ActivityLog
      expect(impactedNames).toContain("Auditable");
    });

    it("finds classes affected by changes to Auditable interface", () => {
      const auditable = findNode("Auditable", "Interface");
      expect(auditable).toBeDefined();

      const impacted = queryImpactedNodes(db, auditable!.id, { maxDepth: 5 });

      const impactedNames = impacted.map((n) => n.name);
      // AuditLog and ActivityLog implement Auditable
      expect(impactedNames).toContain("AuditLog");
      expect(impactedNames).toContain("ActivityLog");
    });

    it("respects maxDepth for impact analysis", () => {
      const entity = findNode("Entity", "Interface");
      expect(entity).toBeDefined();

      // With maxDepth=1, should only find direct dependents (Auditable extends Entity)
      const shallowImpact = queryImpactedNodes(db, entity!.id, { maxDepth: 1 });
      const shallowNames = shallowImpact.map((n) => n.name);
      expect(shallowNames).toContain("Auditable");

      // With maxDepth=2, should also find AuditLog/ActivityLog (implement Auditable)
      const deeperImpact = queryImpactedNodes(db, entity!.id, { maxDepth: 2 });
      const deeperNames = deeperImpact.map((n) => n.name);
      expect(deeperNames).toContain("AuditLog");
      expect(deeperNames).toContain("ActivityLog");
    });
  });

  describe(queryCallers.name, () => {
    it("finds no callers for getId method (not called by any code)", () => {
      const getId = findNode("getId", "Method");
      expect(getId).toBeDefined();

      const callers = queryCallers(db, getId!.id, { maxDepth: 5 });

      // getId is defined but never called in the test project
      expect(callers).toHaveLength(0);
    });

    it("finds no callers for getAdminLevel method (not called by any code)", () => {
      const getAdminLevel = findNode("getAdminLevel", "Method");
      expect(getAdminLevel).toBeDefined();

      const callers = queryCallers(db, getAdminLevel!.id, { maxDepth: 5 });

      // getAdminLevel is defined but never called in the test project
      expect(callers).toHaveLength(0);
    });
  });

  describe(queryCallees.name, () => {
    it("finds no callees for addUser method (makes no external calls)", () => {
      const addUser = findNode("addUser", "Method");
      expect(addUser).toBeDefined();

      const callees = queryCallees(db, addUser!.id, 5);

      // addUser only calls this.users.push which is not tracked as a function node
      expect(callees).toHaveLength(0);
    });

    it("finds no callees for greet function (only uses template literal)", () => {
      const greet = findNode("greet", "Function");
      expect(greet).toBeDefined();

      const callees = queryCallees(db, greet!.id, 5);

      // greet function only returns a template literal, no function calls
      expect(callees).toHaveLength(0);
    });

    it("finds console.log is not tracked as callee for logMessage", () => {
      const logMessage = findNode("logMessage", "Function");
      expect(logMessage).toBeDefined();

      const callees = queryCallees(db, logMessage!.id, 5);

      // console.log is a built-in, not tracked in the graph
      expect(callees).toHaveLength(0);
    });
  });

  describe(queryPath.name, () => {
    it("returns empty array for Entity to AuditLog (wrong direction)", () => {
      const entity = findNode("Entity", "Interface");
      const auditLog = findNode("AuditLog", "Class");
      expect(entity).toBeDefined();
      expect(auditLog).toBeDefined();

      const paths = queryPath(db, entity!.id, auditLog!.id);

      // EXTENDS/IMPLEMENTS edges go child->parent, so Entity->AuditLog has no path
      // (Auditable extends Entity, AuditLog implements Auditable)
      expect(paths).toEqual([]);
    });

    it("returns empty array from BaseService to AdminService (wrong direction)", () => {
      const baseService = findNode("BaseService", "Class");
      const adminService = findNode("AdminService", "Class");
      expect(baseService).toBeDefined();
      expect(adminService).toBeDefined();

      // Note: EXTENDS edges go child->parent, so AdminService->UserService->BaseService
      // Querying in reverse direction (BaseService->AdminService) should return empty
      const paths = queryPath(db, baseService!.id, adminService!.id);
      expect(paths).toEqual([]);
    });

    it("finds path from AdminService to BaseService (following EXTENDS edges)", () => {
      const adminService = findNode("AdminService", "Class");
      const baseService = findNode("BaseService", "Class");
      expect(adminService).toBeDefined();
      expect(baseService).toBeDefined();

      const paths = queryPath(db, adminService!.id, baseService!.id);

      expect(paths.length).toBeGreaterThan(0);
      expect(paths[0]?.nodes).toContain(adminService!.id);
      expect(paths[0]?.nodes).toContain(baseService!.id);
      // Path should go through UserService
      const userService = findNode("UserService", "Class");
      expect(paths[0]?.nodes).toContain(userService!.id);
    });

    it("finds path from AuditLog to Auditable (IMPLEMENTS edge)", () => {
      const auditLog = findNode("AuditLog", "Class");
      const auditable = findNode("Auditable", "Interface");
      expect(auditLog).toBeDefined();
      expect(auditable).toBeDefined();

      const paths = queryPath(db, auditLog!.id, auditable!.id);

      expect(paths.length).toBeGreaterThan(0);
      expect(paths[0]?.nodes).toHaveLength(2);
      expect(paths[0]?.nodes[0]).toBe(auditLog!.id);
      expect(paths[0]?.nodes[1]).toBe(auditable!.id);
      expect(paths[0]?.edges).toHaveLength(1);
      expect(paths[0]?.edges[0]?.type).toBe("IMPLEMENTS");
    });

    it("returns empty array for unconnected nodes", () => {
      const greet = findNode("greet", "Function");
      const user = findNode("User", "Interface");
      expect(greet).toBeDefined();
      expect(user).toBeDefined();

      const paths = queryPath(db, greet!.id, user!.id);

      expect(paths).toEqual([]);
    });
  });

  describe("cross-file type usage impact", () => {
    it("traces impact from types.ts User to models.ts usage", () => {
      const user = findNode("User", "Interface");
      expect(user).toBeDefined();
      expect(user?.filePath).toBe("src/types.ts");

      const impacted = queryImpactedNodes(db, user!.id, { maxDepth: 5 });

      // Should find cross-file dependents in models.ts
      const modelsFileNodes = impacted.filter(
        (n) => n.filePath === "src/models.ts",
      );
      expect(modelsFileNodes.length).toBeGreaterThan(0);

      const modelsNames = modelsFileNodes.map((n) => n.name);
      expect(modelsNames).toContain("addUser");
      expect(modelsNames).toContain("users");
    });
  });

  describe("3-level class hierarchy traversal", () => {
    it("finds AdminService impacted by changes to BaseService", () => {
      const baseService = findNode("BaseService", "Class");
      expect(baseService).toBeDefined();

      const impacted = queryImpactedNodes(db, baseService!.id, { maxDepth: 5 });

      const impactedNames = impacted.map((n) => n.name);
      // BaseService <- UserService <- AdminService
      expect(impactedNames).toContain("UserService");
      expect(impactedNames).toContain("AdminService");
    });

    it("finds UserService impacted by changes to BaseService at depth 1", () => {
      const baseService = findNode("BaseService", "Class");
      expect(baseService).toBeDefined();

      const impacted = queryImpactedNodes(db, baseService!.id, { maxDepth: 1 });

      const impactedNames = impacted.map((n) => n.name);
      // Only direct dependent at depth 1
      expect(impactedNames).toContain("UserService");
      // AdminService is 2 hops away
      expect(impactedNames).not.toContain("AdminService");
    });
  });
});
