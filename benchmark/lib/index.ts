/**
 * Benchmark library for ts-graph test projects.
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
 * npx tsx benchmark/lib/run.ts sample-projects/my-project
 * ```
 */

export * from "./historicalComparison.js";
export * from "./history.js";
export * from "./report.js";
export { runBenchmarks } from "./run.js";
export * from "./runDecision.js";
export * from "./runner.js";
export * from "./scenarios.js";
export * from "./types.js";
