/**
 * Benchmark prompts for layered-api test project.
 *
 * Each prompt represents a realistic developer scenario:
 * - P1: Onboarding to a new codebase (negative test - vague, should NOT use findPaths)
 * - P2: Debugging a slow endpoint (outgoingCallsDeep)
 * - P3: Planning to add caching (findPaths)
 * - P4: Investigating a validation bug report (outgoingCallsDeep with snippets)
 */

import type {
  BenchmarkConfig,
  BenchmarkPrompt,
} from "../../../benchmark/lib/types.js";

/**
 * Configuration for the layered-api benchmark.
 * This is all that's needed - the shared library handles everything else.
 */
export const config: BenchmarkConfig = {
  projectName: "layered-api",
  projectRoot: `${import.meta.dirname}/..`,
};

export const prompts: BenchmarkPrompt[] = [
  {
    id: "P1",
    name: "Onboarding to codebase (negative)",
    prompt:
      "I'm new to this project. Can you explain how the API is structured?",
    expectedContains: ["handleGetUser", "getUserById", "findUserById", "query"],
    // Note: This is a NEGATIVE test - agent should NOT use findPaths for vague questions
    expectedTool: "none",
    expectedTurns: 12,
  },
  {
    id: "P2",
    name: "Slow endpoint debugging",
    prompt: "GET /users/:id is taking 500ms. The handler is handleGetUser.",
    expectedContains: ["getUserById", "findUserById", "query"],
    expectedTool: "outgoingCallsDeep",
    expectedTurns: 2,
  },
  {
    id: "P3",
    name: "Add caching for user lookups",
    prompt:
      "I want to add Redis caching for user lookups. The endpoint is handleGetUser.",
    expectedContains: ["handleGetUser", "getUserById", "findUserById", "query"],
    expectedTool: "findPaths",
    expectedTurns: 3,
  },
  {
    id: "P4",
    name: "Registration validation bug",
    prompt:
      "A user reported that 'test@valid.co' was rejected during registration.",
    expectedContains: ["isValidEmail", "findUserByEmail", ".test(email)"],
    expectedTool: "outgoingCallsDeep",
    expectedTurns: 3,
  },
];
