/**
 * Benchmark prompts for deep-chain test project.
 *
 * Each prompt tests a different MCP tool capability:
 * - P1: outgoingCallsDeep (forward traversal)
 * - P2: findPath (path finding)
 * - P3: analyzeImpact (reverse traversal / impact analysis)
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
		expectedTool: "outgoingCallsDeep",
	},
	{
		id: "P2",
		name: "Call path",
		prompt:
			"What is the call path from entry (in src/step01.ts) to step10 (in src/step10.ts)?",
		expectedContains: ["entry", "step02", "step10"],
		expectedTool: "findPath",
	},
	{
		id: "P3",
		name: "Impact analysis",
		prompt:
			"What code would be affected if I change the step10 function in src/step10.ts?",
		expectedContains: ["entry", "step09"],
		expectedTool: "analyzeImpact",
	},
];
