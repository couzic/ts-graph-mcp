/**
 * Benchmark prompts for monorepo test project.
 *
 * Each prompt tests L3 monorepo capabilities:
 * - P1: Cross-module impact analysis (analyzeImpact)
 * - P2: Utility usage tracking (incomingCallsDeep)
 * - P3: Transitive package dependencies (outgoingPackageDeps)
 * - P4: Reverse package dependencies (incomingPackageDeps)
 * - P5: Ambiguous symbol resolution (findPath with disambiguation)
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
    expectedTool: "analyzeImpact",
    expectedTurns: 2,
  },
  {
    id: "P2",
    name: "Utility usage",
    prompt:
      "What packages and modules use the validateEmail function from modules/shared/packages/utils/src/validate.ts?",
    expectedContains: ["frontend", "backend", "state", "services"],
    expectedTool: "incomingCallsDeep",
    expectedTurns: 2,
  },
  {
    id: "P3",
    name: "Transitive package dependencies",
    prompt:
      "What packages does backend/api depend on? Show me the transitive package dependencies.",
    expectedContains: ["backend/services", "shared/types", "shared/utils"],
    expectedTool: "outgoingPackageDeps",
    expectedTurns: 2,
  },
  {
    id: "P4",
    name: "Reverse package dependencies",
    prompt:
      "What packages depend on shared/types? I want to know what would be affected if I changed this package.",
    expectedContains: ["frontend/ui", "frontend/state", "backend/api", "backend/services"],
    expectedTool: "incomingPackageDeps",
    expectedTurns: 2,
  },
  {
    id: "P5",
    name: "Ambiguous symbol resolution",
    prompt:
      "Find the call path from renderUserCard to the formatDate function in shared utilities.",
    expectedContains: ["renderUserCard", "formatDate", "CALLS"],
    expectedTool: "findPaths",
    expectedTurns: 3,
  },
];
