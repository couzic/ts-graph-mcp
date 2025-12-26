/**
 * Benchmark prompts for call-chain test project.
 *
 * Three code structure patterns, each with 3 prompts:
 *
 * DIRECT_CALL: target()
 * INDIRECT_CALL: const fn = target; fn()
 * FUNCTION_ARGUMENT: orchestrate(items, processor)
 */

import type {
  BenchmarkConfig,
  BenchmarkPrompt,
} from "../../../benchmark/lib/types.js";

/**
 * Configuration for the call-chain benchmark.
 */
export const config: BenchmarkConfig = {
  projectName: "call-chain",
  projectRoot: import.meta.dirname + "/..",
  tsconfig: "tsconfig.json",
};

export const prompts: BenchmarkPrompt[] = [
  {
    id: "DIRECT_CALL_DEPENDENCIES_OF",
    name: "Debug unexpected output",
    prompt:
      "@src/direct-call/entry.ts There is a bug in entry(), analyze its behavior",
    expectedContains: ["entry", "step02", "step03", "step04", "step05"],
    expectedTool: "dependenciesOf",
    expectedTurns: 2,
  },
  {
    id: "DIRECT_CALL_DEPENDENTS_OF",
    name: "Refactor step05 return type",
    prompt:
      "I want to change step05 in @src/direct-call/lib/step05.ts from returning '05' to returning '5'. Analyze impact.",
    expectedContains: ["step04", "step03", "step02", "entry"],
    expectedTool: "dependentsOf",
    expectedTurns: 2,
  },
  {
    id: "DIRECT_CALL_PATHS_BETWEEN",
    name: "Bug in step03 affecting entry",
    prompt:
      "How does entry() in @src/direct-call/entry.ts use step05() in @src/direct-call/lib/step05.ts ?",
    expectedContains: ["entry", "step02", "step03", "step04", "step05"],
    expectedTool: "pathsBetween",
    expectedTurns: 2,
  },

  // INDIRECT_CALL: const fn = target; fn()
  // Chain stored in variables before invocation
  {
    id: "INDIRECT_CALL_DEPENDENCIES_OF",
    name: "Trace variable alias chain",
    prompt:
      "@src/indirect-call/entry.ts There is a bug in entry(), analyze its behavior",
    expectedContains: ["entry", "step02", "step03", "step04", "step05"],
    expectedTool: "dependenciesOf",
    expectedTurns: 2,
  },
  {
    id: "INDIRECT_CALL_DEPENDENTS_OF",
    name: "Impact of changing step05",
    prompt:
      "I want to change step05 in @src/indirect-call/lib/step05.ts from returning '05' to returning '5'. Analyze impact.",
    expectedContains: ["entry", "step02", "step03", "step04", "step05"],
    expectedTool: "dependentsOf",
    expectedTurns: 2,
  },
  {
    id: "INDIRECT_CALL_PATHS_BETWEEN",
    name: "Path through variable aliases",
    prompt:
      "How does entry() in @src/indirect-call/entry.ts use step05() in @src/indirect-call/lib/step05.ts ?",
    expectedContains: ["entry", "step02", "step03", "step04", "step05"],
    expectedTool: "pathsBetween",
    expectedTurns: 2,
  },

  // FUNCTION_ARGUMENT: orchestrate(items, processor)
  // Callback passed through multiple layers
  {
    id: "FUNCTION_ARGUMENT_DEPENDENCIES_OF",
    name: "Trace callback chain",
    prompt:
      "@src/function-argument/entry.ts There is a bug in entry(), analyze its behavior",
    expectedContains: ["orchestrate", "transform", "validate", "processor"],
    expectedTool: "dependenciesOf",
    expectedTurns: 2,
  },
  {
    id: "FUNCTION_ARGUMENT_DEPENDENTS_OF",
    name: "Who uses the processor callback",
    prompt:
      "I want to change the validate function in @src/function-argument/utils/validate.ts. Analyze impact.",
    expectedContains: ["entry", "orchestrate", "transform"],
    expectedTool: "dependentsOf",
    expectedTurns: 2,
  },
  {
    id: "FUNCTION_ARGUMENT_PATHS_BETWEEN",
    name: "Path from entry to validate",
    prompt:
      "How does @src/function-argument/entry.ts entry() use validate() in @src/function-argument/utils/validate.ts ?",
    expectedContains: ["entry", "orchestrate", "transform", "validate"],
    expectedTool: "pathsBetween",
    expectedTurns: 2,
  },
];
