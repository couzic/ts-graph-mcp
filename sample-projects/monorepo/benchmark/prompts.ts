/**
 * Benchmark prompts for monorepo test project.
 *
 * Each prompt tests L3 monorepo capabilities:
 * - P1: Cross-module impact analysis (analyzeImpact)
 * - P2: Utility usage tracking (incomingCallsDeep)
 * - P3: Package dependencies (outgoingImports)
 * - P4: Transitive package dependencies (outgoingPackageDeps)
 * - P5: Reverse package dependencies (incomingPackageDeps)
 *
 * findPath is tested via integration tests, not benchmarks (covered by layered-api).
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
    maxTurns: 2,
  },
  {
    id: "P2",
    name: "Utility usage",
    prompt:
      "What packages and modules use the validateEmail function from modules/shared/packages/utils/src/validate.ts?",
    expectedContains: ["frontend", "backend", "state", "services"],
    expectedTool: "incomingCallsDeep",
    maxTurns: 2,
  },
  {
    id: "P3",
    name: "Package dependencies",
    prompt:
      "What are the dependencies of the backend/api package? Show me what packages it imports from.",
    expectedContains: ["services", "types", "shared"],
    expectedTool: "outgoingImports",
    maxTurns: 2,
  },
  {
    id: "P4",
    name: "Transitive package dependencies",
    prompt:
      "What packages does backend/api depend on? Show me the transitive package dependencies.",
    expectedContains: ["backend/services", "shared/types", "shared/utils"],
    expectedTool: "outgoingPackageDeps",
    maxTurns: 2,
  },
  {
    id: "P5",
    name: "Reverse package dependencies",
    prompt:
      "What packages depend on shared/types? I want to know what would be affected if I changed this package.",
    expectedContains: ["frontend/ui", "frontend/state", "backend/api", "backend/services"],
    expectedTool: "incomingPackageDeps",
    maxTurns: 2,
  },
];
