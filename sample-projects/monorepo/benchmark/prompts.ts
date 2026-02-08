/**
 * Benchmark prompts for monorepo test project.
 *
 * Each prompt represents a realistic developer scenario:
 * - P1: Adding a field to a shared type (analyzeImpact)
 * - P2: Debugging an email validation bug (incomingCallsDeep)
 * - P3: Extracting a package to its own repo (outgoingPackageDeps)
 * - P4: Planning breaking changes to a shared package (incomingPackageDeps)
 * - P5: Investigating a date format bug (findPaths)
 * - P6: Changing a function's return type (incomingCallsDeep with snippets)
 * - P7: Changing error handling strategy (analyzeImpact with snippets)
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
  projectRoot: `${import.meta.dirname}/..`,
};

export const prompts: BenchmarkPrompt[] = [
  {
    id: "P1",
    name: "Add field to User type",
    prompt: "I need to add an `emailVerified` field to the User type.",
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
    name: "International email bug",
    prompt:
      "International emails like `name@例え.jp` are being rejected during registration.",
    expectedContains: ["handleCreateUser", "api", "createUserService"],
    expectedTool: "incomingCallsDeep",
    expectedTurns: 2,
  },
  {
    id: "P3",
    name: "Extract package to own repo",
    prompt: "I want to extract backend/api into its own repository.",
    expectedContains: ["backend/services", "shared/types", "shared/utils"],
    expectedTool: "outgoingPackageDeps",
    expectedTurns: 2,
  },
  {
    id: "P4",
    name: "Rename types in shared package",
    prompt: "I'm going to rename some types in shared/types.",
    expectedContains: [
      "frontend/ui",
      "frontend/state",
      "backend/api",
      "backend/services",
    ],
    expectedTool: "incomingPackageDeps",
    expectedTurns: 2,
  },
  {
    id: "P5",
    name: "Date format bug in user card",
    prompt:
      "The user card shows dates like '2024-01-15' but it should be 'Jan 15, 2024'.",
    expectedContains: ["renderUserCard", "formatDate", "CALLS"],
    expectedTool: "findPaths",
    expectedTurns: 3,
  },
  {
    id: "P6",
    name: "Change validateEmail return type",
    prompt:
      "I want validateEmail to return an error message instead of a boolean.",
    expectedContains: [
      "createUserService",
      "createUserStore",
      "Invalid email format",
      "false",
    ],
    expectedTool: "incomingCallsDeep",
    expectedTurns: 2,
  },
  {
    id: "P7",
    name: "Change validateEmail to throw",
    prompt:
      "validateEmail should throw an exception instead of returning false.",
    expectedContains: [
      "createUserService",
      "createUserStore",
      "Invalid email format",
      "return false",
    ],
    expectedTool: "analyzeImpact",
    expectedTurns: 2,
  },
];
