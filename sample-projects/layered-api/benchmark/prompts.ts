/**
 * Benchmark prompts for layered-api test project.
 *
 * Each prompt tests a different MCP tool capability:
 * - P1: Vague architectural question (negative test - should NOT use findPaths)
 * - P2: outgoingCallsDeep with specific symbol
 * - P3: findPaths with precise source and target symbols (positive test)
 */

import type { BenchmarkConfig, BenchmarkPrompt } from "../../../benchmark/lib/types.js";

/**
 * Configuration for the layered-api benchmark.
 * This is all that's needed - the shared library handles everything else.
 */
export const config: BenchmarkConfig = {
	projectName: "layered-api",
	projectRoot: import.meta.dirname + "/..",
	tsconfig: "tsconfig.json",
};

export const prompts: BenchmarkPrompt[] = [
	{
		id: "P1",
		name: "Vague architecture question (negative)",
		prompt:
			"How does a user request reach the database? Trace the path from the user routes to the database layer.",
		expectedContains: [
			"handleGetUser",
			"getUserById",
			"findUserById",
			"query",
		],
		// Note: This is a NEGATIVE test - agent should NOT use findPaths for vague questions
		expectedTool: "none",
		expectedTurns: 12,
	},
	{
		id: "P2",
		name: "outgoingCallsDeep with specific symbol",
		prompt:
			"What code is between the routes and the database? Start from handleGetUser and show what it calls transitively.",
		expectedContains: [
			"getUserById",
			"findUserById",
			"query",
		],
		expectedTool: "outgoingCallsDeep",
		expectedTurns: 2,
	},
	{
		id: "P3",
		name: "findPaths with precise symbols",
		prompt:
			"Find the call path from handleGetUser to the query function.",
		expectedContains: [
			"handleGetUser",
			"getUserById",
			"findUserById",
			"query",
		],
		expectedTool: "findPaths",
		expectedTurns: 3,
	},
];
