/**
 * Benchmark prompts for layered-api test project.
 *
 * Each prompt tests a different MCP tool capability:
 * - P1: findPath (multi-layer path finding)
 * - P2: getNeighborhood (local ecosystem visualization)
 * - P3: outgoingCallsDeep (forward traversal through layers)
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
		name: "Request to database path",
		prompt:
			"How does a user request reach the database? Trace the path from the user routes to the database layer.",
		expectedContains: [
			"handleGetUser",
			"getUserById",
			"findUserById",
			"query",
		],
		expectedTool: "findPath",
	},
	{
		id: "P2",
		name: "Service dependency graph",
		prompt:
			"What's the dependency graph around UserService? Show what calls it and what it calls.",
		expectedContains: [
			"handleGetUser",
			"getUserById",
			"findUserById",
		],
		expectedTool: "getNeighborhood",
	},
	{
		id: "P3",
		name: "Layers between routes and database",
		prompt:
			"What code is between the routes and the database? Start from handleGetUser and show what it calls transitively.",
		expectedContains: [
			"getUserById",
			"findUserById",
			"query",
		],
		expectedTool: "outgoingCallsDeep",
	},
];
