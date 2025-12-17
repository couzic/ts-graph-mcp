/**
 * Benchmark library for ts-graph-mcp test projects.
 *
 * Provides shared utilities for running benchmarks across test projects.
 *
 * ## Quick Start
 *
 * Each test project only needs a `benchmark/prompts.ts` file:
 *
 * ```typescript
 * import type { BenchmarkConfig, BenchmarkPrompt } from "../../../benchmark/lib/index.js";
 *
 * export const config: BenchmarkConfig = {
 *   projectName: "my-project",
 *   projectRoot: import.meta.dirname + "/..",
 *   tsconfig: "tsconfig.json",
 * };
 *
 * export const prompts: BenchmarkPrompt[] = [
 *   { id: "P1", name: "Test", prompt: "...", expectedContains: [...], expectedTool: "..." },
 * ];
 * ```
 *
 * Then run:
 * ```bash
 * npx tsx benchmark/lib/setup.ts test-projects/my-project
 * npx tsx benchmark/lib/run.ts test-projects/my-project
 * ```
 */

export * from "./types.js";
export * from "./scenarios.js";
export * from "./report.js";
export * from "./runner.js";
export { setupBenchmark } from "./setup.js";
export { runBenchmarks } from "./run.js";
