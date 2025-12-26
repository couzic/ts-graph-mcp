/**
 * Benchmark prompts for references test project.
 *
 * These prompts demonstrate the value of REFERENCES edges for:
 * - Multi-hop path finding through intermediate storage
 * - Understanding callback and handler patterns without manual file reading
 *
 * WITHOUT REFERENCES edges:
 * - Agent must read dispatch() function
 * - See it accesses userFormatters
 * - Read where userFormatters is defined
 * - See it stores formatCustomer and formatAdmin
 * - Multiple turns, multiple file reads
 *
 * WITH REFERENCES edges:
 * - Single findPaths call returns: dispatch → userFormatters → formatCustomer
 * - 1 turn, instant answer
 */

import type {
  BenchmarkConfig,
  BenchmarkPrompt,
} from "../../../benchmark/lib/types.js";

export const config: BenchmarkConfig = {
  projectName: "references",
  projectRoot: import.meta.dirname + "/..",
  tsconfig: "tsconfig.json",
};

export const prompts: BenchmarkPrompt[] = [
  {
    id: "P1",
    name: "findPaths through stored function reference",
    prompt:
      "Find the path from the dispatch function to formatCustomer. How does dispatch eventually reach formatCustomer?",
    expectedContains: ["dispatch", "userFormatters", "formatCustomer"],
    expectedTool: "findPaths",
    expectedTurns: 2,
  },
  {
    id: "P2",
    name: "findPaths through callback pattern",
    prompt:
      "Find the connection between processItems and transformItem. What's the relationship?",
    expectedContains: ["processItems", "transformItem", "REFERENCES"],
    expectedTool: "findPaths",
    expectedTurns: 2,
  },
  {
    id: "P3",
    name: "findPaths through factory return",
    prompt: "How does getErrorHandler relate to logError? Find the path.",
    expectedContains: ["getErrorHandler", "logError"],
    expectedTool: "findPaths",
    expectedTurns: 2,
  },
];
