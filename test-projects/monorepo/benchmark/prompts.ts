/**
 * Benchmark prompts for monorepo test project.
 *
 * Each prompt tests L3 monorepo capabilities:
 * - P1: Cross-package queries within module (get_callers)
 * - P2: Cross-module impact analysis (get_impact)
 * - P3: Package dependencies visualization (get_neighbors)
 *
 * Key differentiator from deep-chain and web-app:
 * This tests BOTH cross-package (within module) AND cross-module edges.
 */

import type {
  BenchmarkConfig,
  BenchmarkPrompt,
} from "../../../benchmark/lib/types.js";

/**
 * Configuration for the monorepo benchmark.
 */
export const config: BenchmarkConfig = {
  projectName: "monorepo",
  projectRoot: import.meta.dirname + "/..",
  tsconfig: "tsconfig.json",
};

export const prompts: BenchmarkPrompt[] = [
  {
    id: "P1",
    name: "Cross-package callers",
    prompt:
      "What code in the backend module calls the createUserService function? The function is in modules/backend/packages/services/src/userService.ts.",
    expectedContains: ["handleCreateUser", "api", "userRoutes"],
    expectedTool: "get_callers",
  },
  {
    id: "P2",
    name: "Cross-module impact",
    prompt:
      "If I change the User interface in modules/shared/packages/types/src/User.ts, what code across all modules would be affected?",
    expectedContains: [
      "frontend",
      "backend",
      "renderUserCard",
      "createUserService",
      "handleCreateUser",
    ],
    expectedTool: "get_impact",
  },
  {
    id: "P3",
    name: "Utility usage",
    prompt:
      "What packages and modules use the validateEmail function from modules/shared/packages/utils/src/validate.ts?",
    expectedContains: ["frontend", "backend", "state", "services"],
    expectedTool: "get_callers",
  },
  {
    id: "P4",
    name: "Package dependencies",
    prompt:
      "What are the dependencies of the backend/api package? Show me what packages it imports from.",
    expectedContains: ["services", "types", "shared"],
    expectedTool: "get_neighbors",
  },
];
