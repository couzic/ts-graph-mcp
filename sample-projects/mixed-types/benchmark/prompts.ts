/**
 * Benchmark prompts for mixed-types test project.
 *
 * Tests type system tools:
 * - P1: incomingUsesType (find type consumers)
 */

import type { BenchmarkConfig, BenchmarkPrompt } from "../../../benchmark/lib/types.js";

/**
 * Configuration for the mixed-types benchmark.
 */
export const config: BenchmarkConfig = {
	projectName: "mixed-types",
	projectRoot: import.meta.dirname + "/..",
	tsconfig: "tsconfig.json",
};

export const prompts: BenchmarkPrompt[] = [
	{
		id: "P1",
		name: "Find type consumers",
		prompt: "What methods use the User type as a parameter?",
		expectedContains: ["addUser"],
		expectedTool: "incomingUsesType",
		expectedTurns: 2,
	},
];
