/**
 * Benchmark prompts for call-chain test project.
 *
 * Each prompt represents a realistic developer scenario:
 * - P1: Debugging unexpected output (dependenciesOf)
 * - P2: Planning a refactor of a leaf function (dependentsOf)
 * - P3: Understanding a bug in the call flow (pathsBetween)
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
		id: "P1",
		name: "Debug unexpected output",
		prompt:
			"entry() returns '05-04-03-02-01' but I expected just '05'. Where is the extra text coming from?",
		expectedContains: ["step02", "step03", "step04", "step05"],
		expectedTool: "dependenciesOf",
		expectedTurns: 3,
	},
	{
		id: "P2",
		name: "Refactor step05 return type",
		prompt:
			"I want to change step05 to return a number instead of a string. What would be affected?",
		expectedContains: ["step04", "step03", "step02", "entry"],
		expectedTool: "dependentsOf",
		expectedTurns: 2,
	},
	{
		id: "P3",
		name: "Bug in step03 affecting entry",
		prompt:
			"There's a bug in step03 that's causing entry() to fail. How does entry reach step03?",
		expectedContains: ["step02", "step03", "entry"],
		expectedTool: "pathsBetween",
		expectedTurns: 2,
	},
];
