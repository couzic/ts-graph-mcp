import type Database from "better-sqlite3";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { queryEdges } from "../../src/db/queryEdges.js";
import {
  closeDatabase,
  openDatabase,
} from "../../src/db/sqlite/SqliteConnection.js";
import { initializeSchema } from "../../src/db/sqlite/SqliteSchema.js";
import { createSqliteWriter } from "../../src/db/sqlite/SqliteWriter.js";
import { indexProject } from "../../src/ingestion/Ingestion.js";
import { queryImpactedNodes } from "../../src/tools/analyze-impact/query.js";
import { querySearchNodes } from "../../src/tools/search-symbols/query.js";
import config from "./ts-graph-mcp.config.js";

/**
 * Integration tests for monorepo test project.
 *
 * Structure (L3: multi-module, multi-package):
 * - shared:
 *   - types: User, Config interfaces + createUser function
 *   - utils: formatDate, validateEmail utilities
 * - frontend:
 *   - ui: UserCard, Button components
 *   - state: userStore state management
 * - backend:
 *   - services: userService business logic
 *   - api: userRoutes, orderRoutes handlers
 *
 * KEY DIFFERENCE FROM web-app:
 * This project tests cross-package edges WITHIN the same module:
 *   - backend/api → backend/services (cross-package, same module)
 *   - backend/services → shared/utils (cross-module)
 *
 * Tests:
 * 1. Node extraction with correct module/package assignment
 * 2. Cross-package edges within same module
 * 3. Cross-module edges between packages
 * 4. Module filtering
 * 5. Package filtering
 * 6. Module + package filtering combined
 * 7. Impact analysis at package granularity
 */
describe("monorepo integration (L3: multi-module, multi-package)", () => {
  let db: Database.Database;

  beforeAll(async () => {
    db = openDatabase({ path: ":memory:" });
    initializeSchema(db);

    const writer = createSqliteWriter(db);
    await indexProject(config, writer, { projectRoot: import.meta.dirname });
  });

  afterAll(() => {
    closeDatabase(db);
  });

  describe("node extraction", () => {
    it("extracts nodes from shared/types package", () => {
      const result = querySearchNodes(db, "*", {
        module: "shared",
        package: "types",
      });

      const names = result.map((n) => n.name);
      expect(names).toContain("User");
      expect(names).toContain("Config");
      expect(names).toContain("createUser");
      expect(names).toContain("defaultConfig");
    });

    it("extracts nodes from shared/utils package", () => {
      const result = querySearchNodes(db, "*", {
        module: "shared",
        package: "utils",
      });

      const names = result.map((n) => n.name);
      expect(names).toContain("formatDate");
      expect(names).toContain("formatDateTime");
      expect(names).toContain("validateEmail");
      expect(names).toContain("validateRequired");
    });

    it("extracts nodes from frontend/ui package", () => {
      const result = querySearchNodes(db, "*", {
        module: "frontend",
        package: "ui",
      });

      const names = result.map((n) => n.name);
      expect(names).toContain("renderUserCard");
      expect(names).toContain("renderUserList");
      expect(names).toContain("renderButton");
      expect(names).toContain("ButtonProps");
    });

    it("extracts nodes from frontend/state package", () => {
      const result = querySearchNodes(db, "*", {
        module: "frontend",
        package: "state",
      });

      const names = result.map((n) => n.name);
      expect(names).toContain("createUserStore");
      expect(names).toContain("UserStoreState");
      expect(names).toContain("UserStore");
    });

    it("extracts nodes from backend/services package", () => {
      const result = querySearchNodes(db, "*", {
        module: "backend",
        package: "services",
      });

      const names = result.map((n) => n.name);
      expect(names).toContain("createUserService");
      expect(names).toContain("getUserSummary");
      expect(names).toContain("createUsersService");
      expect(names).toContain("UserServiceResponse");
    });

    it("extracts nodes from backend/api package", () => {
      const result = querySearchNodes(db, "*", {
        module: "backend",
        package: "api",
      });

      const names = result.map((n) => n.name);
      expect(names).toContain("handleCreateUser");
      expect(names).toContain("handleGetUserSummary");
      expect(names).toContain("handleCreateOrder");
      expect(names).toContain("Request");
      expect(names).toContain("Response");
      expect(names).toContain("Order");
    });
  });

  describe("cross-package CALLS edges (within same module)", () => {
    /**
     * KEY TEST: This is what differentiates monorepo from web-app.
     * backend/api/userRoutes.ts calls backend/services/userService.ts functions.
     */
    it("creates CALLS edge from backend/api handleCreateUser to backend/services createUserService", () => {
      const edges = queryEdges(db, {
        type: "CALLS",
        sourcePattern: "*handleCreateUser*",
        targetPattern: "*createUserService*",
      });

      expect(edges.length).toBeGreaterThan(0);
      // Both source and target should be in backend module but different packages
      expect(edges[0]?.source).toContain("backend");
      expect(edges[0]?.target).toContain("backend");
    });

    it("creates CALLS edge from backend/api handleGetUserSummary to backend/services getUserSummary", () => {
      const edges = queryEdges(db, {
        type: "CALLS",
        sourcePattern: "*handleGetUserSummary*",
        targetPattern: "*getUserSummary*",
      });

      expect(edges.length).toBeGreaterThan(0);
    });
  });

  describe("cross-module CALLS edges (between modules)", () => {
    /**
     * backend/services calls shared/utils and shared/types functions.
     */
    it("creates CALLS edge from backend/services createUserService to shared/utils validateEmail", () => {
      const edges = queryEdges(db, {
        type: "CALLS",
        sourcePattern: "*createUserService*",
        targetPattern: "*validateEmail*",
      });

      expect(edges.length).toBeGreaterThan(0);
      expect(edges[0]?.source).toContain("backend");
      expect(edges[0]?.target).toContain("shared");
    });

    it("creates CALLS edge from backend/services createUserService to shared/types createUser", () => {
      const allEdges = queryEdges(db, {
        type: "CALLS",
        sourcePattern: "*createUserService*",
        targetPattern: "*createUser*",
      });
      // Filter out edges where target contains 'createUserService'
      const edges = allEdges.filter((e) => !e.target.includes("createUserService"));

      expect(edges.length).toBeGreaterThan(0);
      expect(edges[0]?.target).toContain("shared");
    });

    it("creates CALLS edge from frontend/ui renderUserCard to shared/utils formatDate", () => {
      const edges = queryEdges(db, {
        type: "CALLS",
        sourcePattern: "*renderUserCard*",
        targetPattern: "*formatDate*",
      });

      expect(edges.length).toBeGreaterThan(0);
      expect(edges[0]?.source).toContain("frontend");
      expect(edges[0]?.target).toContain("shared");
    });

    it("creates CALLS edge from frontend/state createUserStore to shared/utils validateEmail", () => {
      const edges = queryEdges(db, {
        type: "CALLS",
        sourcePattern: "*createUserStore*",
        targetPattern: "*validateEmail*",
      });

      expect(edges.length).toBeGreaterThan(0);
    });
  });

  describe("cross-module USES_TYPE edges", () => {
    /**
     * Functions that use User type from shared/types.
     */
    it("creates USES_TYPE edge from frontend/ui renderUserCard to shared/types User", () => {
      const edges = queryEdges(db, {
        type: "USES_TYPE",
        sourcePattern: "*renderUserCard*",
        targetPattern: "*User",
      });

      expect(edges.length).toBeGreaterThan(0);
      expect(edges[0]?.target).toContain("shared");
      expect(edges[0]?.context).toBe("parameter");
    });

    /**
     * Note: createUserService returns UserServiceResponse<User>, which is a generic type.
     * The edge extractor creates USES_TYPE edges for the wrapper type but not for
     * generic type arguments. This is expected behavior.
     *
     * We test getUserSummary instead, which has User directly in parameter.
     */
    it("creates USES_TYPE edge from backend/services getUserSummary to shared/types User (parameter)", () => {
      const edges = queryEdges(db, {
        type: "USES_TYPE",
        sourcePattern: "*getUserSummary*",
        targetPattern: "*User",
        context: "parameter",
      });

      expect(edges.length).toBeGreaterThan(0);
      expect(edges[0]?.target).toContain("shared");
    });

    it("creates USES_TYPE edge from backend/api handleCreateOrder to shared/types User and Config", () => {
      const edges = queryEdges(db, {
        type: "USES_TYPE",
        sourcePattern: "*handleCreateOrder*",
      });

      expect(edges.length).toBeGreaterThanOrEqual(2);

      const targetNames = edges.map((e) => e.target);
      expect(targetNames.some((t) => t.includes("User"))).toBe(true);
      expect(targetNames.some((t) => t.includes("Config"))).toBe(true);
    });
  });

  describe("module filtering", () => {
    it("searchSymbols with module=shared returns only shared nodes", () => {
      const nodes = querySearchNodes(db, "*", { module: "shared" });

      expect(nodes.length).toBeGreaterThan(0);
      expect(nodes.every((n) => n.module === "shared")).toBe(true);
    });

    it("searchSymbols with module=frontend returns only frontend nodes", () => {
      const nodes = querySearchNodes(db, "*", { module: "frontend" });

      expect(nodes.length).toBeGreaterThan(0);
      expect(nodes.every((n) => n.module === "frontend")).toBe(true);
    });

    it("searchSymbols with module=backend returns only backend nodes", () => {
      const nodes = querySearchNodes(db, "*", { module: "backend" });

      expect(nodes.length).toBeGreaterThan(0);
      expect(nodes.every((n) => n.module === "backend")).toBe(true);
    });
  });

  describe("package filtering", () => {
    it("searchSymbols with package=types returns only types package nodes", () => {
      const nodes = querySearchNodes(db, "*", { package: "types" });

      expect(nodes.length).toBeGreaterThan(0);
      expect(nodes.every((n) => n.package === "types")).toBe(true);
    });

    it("searchSymbols with package=utils returns only utils package nodes", () => {
      const nodes = querySearchNodes(db, "*", { package: "utils" });

      expect(nodes.length).toBeGreaterThan(0);
      expect(nodes.every((n) => n.package === "utils")).toBe(true);
    });

    it("searchSymbols with package=api returns only api package nodes", () => {
      const nodes = querySearchNodes(db, "*", { package: "api" });

      expect(nodes.length).toBeGreaterThan(0);
      expect(nodes.every((n) => n.package === "api")).toBe(true);
    });

    it("searchSymbols with package=services returns only services package nodes", () => {
      const nodes = querySearchNodes(db, "*", { package: "services" });

      expect(nodes.length).toBeGreaterThan(0);
      expect(nodes.every((n) => n.package === "services")).toBe(true);
    });
  });

  describe("module + package filtering combined", () => {
    it("searchSymbols with module=shared + package=types returns correct subset", () => {
      const nodes = querySearchNodes(db, "*", {
        module: "shared",
        package: "types",
      });

      expect(nodes.length).toBeGreaterThan(0);
      expect(nodes.every((n) => n.module === "shared")).toBe(true);
      expect(nodes.every((n) => n.package === "types")).toBe(true);

      const names = nodes.map((n) => n.name);
      expect(names).toContain("User");
      expect(names).toContain("Config");
      expect(names).not.toContain("formatDate"); // from utils package
    });

    it("searchSymbols with module=backend + package=api excludes services", () => {
      const nodes = querySearchNodes(db, "*", {
        module: "backend",
        package: "api",
      });

      const names = nodes.map((n) => n.name);
      expect(names).toContain("handleCreateUser");
      expect(names).not.toContain("createUserService"); // from services package
    });
  });

  describe("cross-module impact analysis", () => {
    it("analyzeImpact on shared/types User shows dependents from ALL modules", () => {
      const userNode = querySearchNodes(db, "User", {
        module: "shared",
        package: "types",
        type: "Interface",
      })[0];

      expect(userNode).toBeDefined();

      const impacted = queryImpactedNodes(db, userNode!.id, {
        maxDepth: 5,
        edgeTypes: ["USES_TYPE"],
      });

      const modules = [...new Set(impacted.map((n) => n.module))];

      // User is used in frontend AND backend
      expect(modules).toContain("frontend");
      expect(modules).toContain("backend");
    });

    it("analyzeImpact on shared/utils validateEmail shows callers from multiple modules", () => {
      const validateEmailNode = querySearchNodes(db, "validateEmail", {
        module: "shared",
        package: "utils",
        type: "Function",
      })[0];

      expect(validateEmailNode).toBeDefined();

      const impacted = queryImpactedNodes(db, validateEmailNode!.id, {
        maxDepth: 5,
        edgeTypes: ["CALLS"],
      });

      const impactedNames = impacted.map((n) => n.name);
      // Called from frontend/state and backend/services
      expect(impactedNames).toContain("createUserStore");
      expect(impactedNames).toContain("createUserService");
    });

    it("analyzeImpact on shared/utils formatDate shows callers from multiple modules", () => {
      const formatDateNode = querySearchNodes(db, "formatDate", {
        module: "shared",
        package: "utils",
        type: "Function",
      })[0];

      expect(formatDateNode).toBeDefined();

      const impacted = queryImpactedNodes(db, formatDateNode!.id, {
        maxDepth: 5,
        edgeTypes: ["CALLS"],
      });

      const modules = [...new Set(impacted.map((n) => n.module))];
      // formatDate is called from frontend/ui and backend/services
      expect(modules).toContain("frontend");
      expect(modules).toContain("backend");
    });
  });

  describe("cross-package impact (within module)", () => {
    /**
     * KEY TEST: Impact analysis at package granularity within same module.
     */
    it("analyzeImpact on backend/services createUserService shows backend/api callers", () => {
      const createUserServiceNode = querySearchNodes(db, "createUserService", {
        module: "backend",
        package: "services",
        type: "Function",
      })[0];

      expect(createUserServiceNode).toBeDefined();

      const impacted = queryImpactedNodes(db, createUserServiceNode!.id, {
        maxDepth: 5,
        edgeTypes: ["CALLS"],
      });

      const impactedNames = impacted.map((n) => n.name);
      expect(impactedNames).toContain("handleCreateUser");

      // Verify it's from the api package
      const apiCallers = impacted.filter((n) => n.package === "api");
      expect(apiCallers.length).toBeGreaterThan(0);
    });
  });

  describe("edge summary (diagnostic)", () => {
    it("logs all nodes by module and package for debugging", () => {
      const allNodes = querySearchNodes(db, "*");

      console.log("\n=== Monorepo Node Summary ===");
      console.log(`Total nodes: ${allNodes.length}`);

      // Group by module and package
      const byModuleAndPackage = allNodes.reduce(
        (acc, n) => {
          const key = `${n.module}/${n.package}`;
          acc[key] = acc[key] || [];
          acc[key].push(n);
          return acc;
        },
        {} as Record<string, typeof allNodes>
      );

      console.log("\nNodes by module/package:");
      for (const [key, nodes] of Object.entries(byModuleAndPackage).sort()) {
        console.log(`  ${key}: ${nodes.length} nodes`);
        for (const n of nodes.slice(0, 3)) {
          console.log(`    - ${n.type} ${n.name}`);
        }
        if (nodes.length > 3) {
          console.log(`    ... and ${nodes.length - 3} more`);
        }
      }

      expect(allNodes.length).toBeGreaterThan(0);
    });

    it("logs cross-package and cross-module edges for debugging", () => {
      const edges = queryEdges(db);
      const allNodes = querySearchNodes(db, "*");

      // Build node lookup map
      const nodeMap = new Map(allNodes.map((n) => [n.id, n]));

      // Enrich edges with node metadata
      const allEdges = edges
        .map((e) => {
          const sourceNode = nodeMap.get(e.source);
          const targetNode = nodeMap.get(e.target);
          if (!sourceNode || !targetNode) return null;

          return {
            source: e.source,
            target: e.target,
            type: e.type,
            source_module: sourceNode.module,
            source_package: sourceNode.package,
            target_module: targetNode.module,
            target_package: targetNode.package,
          };
        })
        .filter((e): e is NonNullable<typeof e> => e !== null);

      // Count edge types
      const edgeCounts = allEdges.reduce(
        (acc, e) => {
          acc[e.type] = (acc[e.type] || 0) + 1;
          return acc;
        },
        {} as Record<string, number>
      );

      console.log("\n=== Monorepo Edge Summary ===");
      console.log("Edge counts by type:", edgeCounts);

      // Cross-module edges (different modules)
      const crossModuleEdges = allEdges.filter(
        (e) => e.source_module !== e.target_module
      );
      console.log(`\nCross-module edges: ${crossModuleEdges.length}`);
      for (const e of crossModuleEdges.slice(0, 10)) {
        console.log(
          `  ${e.type}: ${e.source_module}/${e.source_package} → ${e.target_module}/${e.target_package}`
        );
      }

      // Cross-package edges within same module
      const crossPackageEdges = allEdges.filter(
        (e) =>
          e.source_module === e.target_module &&
          e.source_package !== e.target_package
      );
      console.log(`\nCross-package edges (same module): ${crossPackageEdges.length}`);
      for (const e of crossPackageEdges.slice(0, 10)) {
        console.log(
          `  ${e.type}: ${e.source_module}/${e.source_package} → ${e.target_module}/${e.target_package}`
        );
      }

      expect(crossModuleEdges.length, "Should have cross-module edges").toBeGreaterThan(0);
      expect(crossPackageEdges.length, "Should have cross-package edges within same module").toBeGreaterThan(0);
    });
  });
});
