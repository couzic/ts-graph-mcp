import type Database from "better-sqlite3";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { queryNodes } from "../../src/db/queryNodes.js";
import {
	closeDatabase,
	openDatabase,
} from "../../src/db/sqlite/sqliteConnection.utils.js";
import { createSqliteWriter } from "../../src/db/sqlite/createSqliteWriter.js";
import { initializeSchema } from "../../src/db/sqlite/sqliteSchema.utils.js";
import { indexProject } from "../../src/ingestion/indexProject.js";

// Tool query functions
import { queryImpactedNodes } from "../../src/tools/analyze-impact/query.js";
import { queryPath } from "../../src/tools/find-paths/query.js";
import { queryCallers } from "../../src/tools/incoming-calls-deep/query.js";
import { queryIncomingPackageDeps } from "../../src/tools/incoming-package-deps/query.js";
import { queryCallees } from "../../src/tools/outgoing-calls-deep/query.js";
import { queryPackageDeps } from "../../src/tools/outgoing-package-deps/query.js";

import config from "./ts-graph-mcp.config.js";

/**
 * E2E tests for monorepo sample project.
 *
 * Structure (L3: multi-module, multi-package):
 * - shared: types (User, Config), utils (formatDate, validateEmail)
 * - frontend: ui (UserCard, Button), state (userStore)
 * - backend: api (userRoutes, orderRoutes), services (userService)
 *
 * Tests MCP tool query functions against the indexed graph.
 */
describe("monorepo e2e", () => {
	let db: Database.Database;

	beforeAll(async () => {
		db = openDatabase({ path: ":memory:" });
		initializeSchema(db);
		const writer = createSqliteWriter(db);
		await indexProject(config, writer, { projectRoot: import.meta.dirname });
	});

	afterAll(() => closeDatabase(db));

	// Helper to find a node by name with optional filters
	function findNode(name: string, filters?: { type?: string; module?: string; package?: string }) {
		const nodes = queryNodes(db, name, filters);
		return nodes[0];
	}

	describe(queryPackageDeps.name, () => {
		it("finds backend/api depends on backend/services and shared packages", () => {
			const result = queryPackageDeps(db, "backend", "api");

			expect(result.packages.length).toBeGreaterThan(0);

			const packageIds = result.packages.map((p) => `${p.module}/${p.package}`);

			// backend/api imports from backend/services
			expect(packageIds).toContain("backend/services");

			// backend/api imports from shared/types (via userRoutes importing User)
			expect(packageIds).toContain("shared/types");
		});

		it("finds backend/services depends on shared/types and shared/utils", () => {
			const result = queryPackageDeps(db, "backend", "services");

			const packageIds = result.packages.map((p) => `${p.module}/${p.package}`);

			// userService imports from shared/types (User, createUser)
			expect(packageIds).toContain("shared/types");

			// userService imports from shared/utils (validateEmail, formatDate)
			expect(packageIds).toContain("shared/utils");
		});

		it("finds frontend/ui depends on shared/types and shared/utils", () => {
			const result = queryPackageDeps(db, "frontend", "ui");

			const packageIds = result.packages.map((p) => `${p.module}/${p.package}`);

			// UserCard imports User from shared/types
			expect(packageIds).toContain("shared/types");

			// UserCard imports formatDate from shared/utils
			expect(packageIds).toContain("shared/utils");
		});

		it("finds frontend/state depends on shared/types and shared/utils", () => {
			const result = queryPackageDeps(db, "frontend", "state");

			const packageIds = result.packages.map((p) => `${p.module}/${p.package}`);

			// userStore imports User from shared/types
			expect(packageIds).toContain("shared/types");

			// userStore imports validateEmail from shared/utils
			expect(packageIds).toContain("shared/utils");
		});

		it("respects maxDepth=1 for direct dependencies only", () => {
			const result = queryPackageDeps(db, "backend", "api", 1);

			const packageIds = result.packages.map((p) => `${p.module}/${p.package}`);

			// Direct dependency
			expect(packageIds).toContain("backend/services");
			expect(packageIds).toContain("shared/types");

			// All dependencies at depth 1 should have depth === 1
			expect(result.packages.every((p) => p.depth === 1)).toBe(true);
		});
	});

	describe(queryIncomingPackageDeps.name, () => {
		it("finds shared/types is depended on by frontend and backend packages", () => {
			const result = queryIncomingPackageDeps(db, {
				module: "shared",
				package: "types",
				maxDepth: 10,
			});

			expect(result.centerExists).toBe(true);

			// Filter out the center package
			const dependentPackages = result.packages.filter((p) => p.depth > 0);
			const packageIds = dependentPackages.map((p) => p.packageId);

			// frontend packages depend on shared/types
			expect(packageIds).toContain("frontend/ui");
			expect(packageIds).toContain("frontend/state");

			// backend packages depend on shared/types
			expect(packageIds).toContain("backend/api");
			expect(packageIds).toContain("backend/services");
		});

		it("finds shared/utils is depended on by multiple packages", () => {
			const result = queryIncomingPackageDeps(db, {
				module: "shared",
				package: "utils",
				maxDepth: 10,
			});

			expect(result.centerExists).toBe(true);

			const dependentPackages = result.packages.filter((p) => p.depth > 0);
			const packageIds = dependentPackages.map((p) => p.packageId);

			// frontend packages that use validateEmail or formatDate
			expect(packageIds).toContain("frontend/ui");
			expect(packageIds).toContain("frontend/state");

			// backend/services uses validateEmail and formatDate
			expect(packageIds).toContain("backend/services");
		});

		it("finds backend/services is depended on by backend/api", () => {
			const result = queryIncomingPackageDeps(db, {
				module: "backend",
				package: "services",
				maxDepth: 10,
			});

			expect(result.centerExists).toBe(true);

			const dependentPackages = result.packages.filter((p) => p.depth > 0);
			const packageIds = dependentPackages.map((p) => p.packageId);

			// backend/api imports from backend/services
			expect(packageIds).toContain("backend/api");
		});
	});

	describe(queryImpactedNodes.name, () => {
		it("changing shared/types User affects frontend and backend", () => {
			const userNode = findNode("User", {
				type: "Interface",
				module: "shared",
				package: "types",
			});
			expect(userNode).toBeDefined();

			const impacted = queryImpactedNodes(db, userNode!.id, { maxDepth: 5 });

			const modules = [...new Set(impacted.map((n) => n.module))];

			// User is used in frontend AND backend modules
			expect(modules).toContain("frontend");
			expect(modules).toContain("backend");
		});

		it("changing shared/utils validateEmail affects callers in frontend and backend", () => {
			const validateEmailNode = findNode("validateEmail", {
				type: "Function",
				module: "shared",
				package: "utils",
			});
			expect(validateEmailNode).toBeDefined();

			const impacted = queryImpactedNodes(db, validateEmailNode!.id, { maxDepth: 5 });

			const impactedNames = impacted.map((n) => n.name);

			// Called from frontend/state
			expect(impactedNames).toContain("createUserStore");

			// Called from backend/services
			expect(impactedNames).toContain("createUserService");
		});

		it("changing shared/utils formatDate affects callers across modules", () => {
			const formatDateNode = findNode("formatDate", {
				type: "Function",
				module: "shared",
				package: "utils",
			});
			expect(formatDateNode).toBeDefined();

			const impacted = queryImpactedNodes(db, formatDateNode!.id, { maxDepth: 5 });

			const modules = [...new Set(impacted.map((n) => n.module))];

			// formatDate is called from frontend/ui and backend/services
			expect(modules).toContain("frontend");
			expect(modules).toContain("backend");
		});

		it("changing backend/services createUserService affects backend/api", () => {
			const createUserServiceNode = findNode("createUserService", {
				type: "Function",
				module: "backend",
				package: "services",
			});
			expect(createUserServiceNode).toBeDefined();

			const impacted = queryImpactedNodes(db, createUserServiceNode!.id, { maxDepth: 5 });

			const impactedNames = impacted.map((n) => n.name);

			// Called from backend/api
			expect(impactedNames).toContain("handleCreateUser");

			// Also transitively impacts createUsersService (which calls createUserService)
			expect(impactedNames).toContain("createUsersService");
		});
	});

	describe(queryPath.name, () => {
		it("finds path from handleCreateUser to validateEmail (backend/api -> backend/services -> shared/utils)", () => {
			const handleCreateUser = findNode("handleCreateUser", {
				type: "Function",
				module: "backend",
				package: "api",
			});
			const validateEmail = findNode("validateEmail", {
				type: "Function",
				module: "shared",
				package: "utils",
			});

			expect(handleCreateUser).toBeDefined();
			expect(validateEmail).toBeDefined();

			const result = queryPath(db, handleCreateUser!.id, validateEmail!.id);

			expect(result).not.toBeNull();
			// Path: handleCreateUser -> createUserService -> validateEmail (3 nodes, 2 edges)
			expect(result!.nodes).toHaveLength(3);
			expect(result!.edges).toHaveLength(2);

			expect(result!.nodes.some((id) => id.includes("handleCreateUser"))).toBe(true);
			expect(result!.nodes.some((id) => id.includes("createUserService"))).toBe(true);
			expect(result!.nodes.some((id) => id.includes("validateEmail"))).toBe(true);
		});

		it("finds direct path from renderUserCard to formatDate (frontend -> shared)", () => {
			const renderUserCard = findNode("renderUserCard", {
				type: "Function",
				module: "frontend",
				package: "ui",
			});
			const formatDate = findNode("formatDate", {
				type: "Function",
				module: "shared",
				package: "utils",
			});

			expect(renderUserCard).toBeDefined();
			expect(formatDate).toBeDefined();

			const result = queryPath(db, renderUserCard!.id, formatDate!.id);

			expect(result).not.toBeNull();
			// Direct call: renderUserCard -> formatDate (2 nodes, 1 edge)
			expect(result!.nodes).toHaveLength(2);
			expect(result!.edges).toHaveLength(1);
		});

		it("returns null for path in wrong direction", () => {
			const validateEmail = findNode("validateEmail", {
				type: "Function",
				module: "shared",
				package: "utils",
			});
			const handleCreateUser = findNode("handleCreateUser", {
				type: "Function",
				module: "backend",
				package: "api",
			});

			expect(validateEmail).toBeDefined();
			expect(handleCreateUser).toBeDefined();

			// No path from leaf function back to API handler
			const result = queryPath(db, validateEmail!.id, handleCreateUser!.id);
			expect(result).toBeNull();
		});

		it("finds path from handleGetUserSummary to formatDate (through getUserSummary)", () => {
			const handleGetUserSummary = findNode("handleGetUserSummary", {
				type: "Function",
				module: "backend",
				package: "api",
			});
			const formatDate = findNode("formatDate", {
				type: "Function",
				module: "shared",
				package: "utils",
			});

			expect(handleGetUserSummary).toBeDefined();
			expect(formatDate).toBeDefined();

			const result = queryPath(db, handleGetUserSummary!.id, formatDate!.id);

			expect(result).not.toBeNull();
			// Path: handleGetUserSummary -> getUserSummary -> formatDate (3 nodes, 2 edges)
			expect(result!.nodes).toHaveLength(3);
			expect(result!.edges).toHaveLength(2);

			expect(result!.nodes.some((id) => id.includes("getUserSummary"))).toBe(true);
		});
	});

	describe(queryCallers.name, () => {
		it("finds all callers of validateEmail across modules", () => {
			const validateEmail = findNode("validateEmail", {
				type: "Function",
				module: "shared",
				package: "utils",
			});
			expect(validateEmail).toBeDefined();

			const callers = queryCallers(db, validateEmail!.id, { maxDepth: 5 });

			const callerNames = callers.map((n) => n.name);

			// Direct callers
			expect(callerNames).toContain("createUserStore"); // frontend/state
			expect(callerNames).toContain("createUserService"); // backend/services

			// Transitive callers (through createUserService)
			expect(callerNames).toContain("handleCreateUser"); // backend/api
			expect(callerNames).toContain("createUsersService"); // backend/services
		});

		it("finds cross-package callers within same module (backend/api calls backend/services)", () => {
			const createUserService = findNode("createUserService", {
				type: "Function",
				module: "backend",
				package: "services",
			});
			expect(createUserService).toBeDefined();

			const callers = queryCallers(db, createUserService!.id, { maxDepth: 3 });

			const callerNames = callers.map((n) => n.name);

			// backend/api handlers call backend/services functions
			expect(callerNames).toContain("handleCreateUser");
			expect(callerNames).toContain("createUsersService");
		});

		it("respects maxDepth=1 for direct callers only", () => {
			const validateEmail = findNode("validateEmail", {
				type: "Function",
				module: "shared",
				package: "utils",
			});
			expect(validateEmail).toBeDefined();

			const directCallers = queryCallers(db, validateEmail!.id, { maxDepth: 1 });
			const allCallers = queryCallers(db, validateEmail!.id, { maxDepth: 5 });

			// Should have fewer callers with depth limit
			expect(directCallers.length).toBeLessThan(allCallers.length);

			const directCallerNames = directCallers.map((n) => n.name);

			// Direct callers only
			expect(directCallerNames).toContain("createUserStore");
			expect(directCallerNames).toContain("createUserService");

			// Transitive callers should NOT be included
			expect(directCallerNames).not.toContain("handleCreateUser");
		});
	});

	describe(queryCallees.name, () => {
		it("finds all functions called by handleCreateUser transitively", () => {
			const handleCreateUser = findNode("handleCreateUser", {
				type: "Function",
				module: "backend",
				package: "api",
			});
			expect(handleCreateUser).toBeDefined();

			const callees = queryCallees(db, handleCreateUser!.id, 5);

			const calleeNames = callees.map((n) => n.name);

			// Direct callee
			expect(calleeNames).toContain("createUserService");

			// Transitive callees (through createUserService)
			expect(calleeNames).toContain("validateRequired");
			expect(calleeNames).toContain("validateEmail");
			expect(calleeNames).toContain("createUser");
		});

		it("finds functions called by createUserService", () => {
			const createUserService = findNode("createUserService", {
				type: "Function",
				module: "backend",
				package: "services",
			});
			expect(createUserService).toBeDefined();

			const callees = queryCallees(db, createUserService!.id, 3);

			const calleeNames = callees.map((n) => n.name);

			// Direct callees from createUserService
			expect(calleeNames).toContain("validateRequired");
			expect(calleeNames).toContain("validateEmail");
			expect(calleeNames).toContain("createUser");
		});

		it("respects maxDepth=1 for direct callees only", () => {
			const handleCreateUser = findNode("handleCreateUser", {
				type: "Function",
				module: "backend",
				package: "api",
			});
			expect(handleCreateUser).toBeDefined();

			const directCallees = queryCallees(db, handleCreateUser!.id, 1);
			const allCallees = queryCallees(db, handleCreateUser!.id, 5);

			// Should have fewer callees with depth limit
			expect(directCallees.length).toBeLessThan(allCallees.length);

			const directCalleeNames = directCallees.map((n) => n.name);

			// Direct callee only
			expect(directCalleeNames).toContain("createUserService");

			// Transitive callees should NOT be included at depth 1
			expect(directCalleeNames).not.toContain("validateEmail");
		});
	});
});
