/**
 * Benchmark prompts for deep-chain test project.
 *
 * Each prompt tests a different MCP tool capability:
 * - P1: get_callees (forward traversal)
 * - P2: find_path (path finding)
 * - P3: get_impact (reverse traversal / impact analysis)
 */

import type { BenchmarkConfig, BenchmarkPrompt } from "../../../benchmark/lib/types.js";

/**
 * Configuration for the deep-chain benchmark.
 * This is all that's needed - the shared library handles everything else.
 */
export const config: BenchmarkConfig = {
	projectName: "deep-chain",
	projectRoot: import.meta.dirname + "/..",
	tsconfig: "tsconfig.json",
};

export const prompts: BenchmarkPrompt[] = [
	{
		id: "P1",
		name: "Transitive callees",
		prompt:
			"What functions does entry call transitively? The entry function is in src/step01.ts.",
		expectedContains: [
			"step02",
			"step03",
			"step04",
			"step05",
			"step06",
			"step07",
			"step08",
			"step09",
			"step10",
		],
		expectedTool: "get_callees",
	},
	{
		id: "P2",
		name: "Call path",
		prompt:
			"What is the call path from entry (in src/step01.ts) to step10 (in src/step10.ts)?",
		expectedContains: ["entry", "step02", "step10"],
		expectedTool: "find_path",
	},
	{
		id: "P3",
		name: "Impact analysis",
		prompt:
			"What code would be affected if I change the step10 function in src/step10.ts?",
		expectedContains: ["entry", "step09"],
		expectedTool: "get_impact",
	},
];
