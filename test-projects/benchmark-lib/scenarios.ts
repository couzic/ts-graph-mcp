/**
 * Shared benchmark scenarios: WITH vs WITHOUT MCP tools.
 * Used by all test project benchmarks.
 */

import type { BenchmarkScenario } from "./types.js";

/**
 * All MCP tools available for benchmarking.
 */
const MCP_TOOLS = [
	"mcp__ts-graph-mcp__get_callees",
	"mcp__ts-graph-mcp__get_callers",
	"mcp__ts-graph-mcp__find_path",
	"mcp__ts-graph-mcp__get_impact",
	"mcp__ts-graph-mcp__search_nodes",
	"mcp__ts-graph-mcp__get_neighbors",
	"mcp__ts-graph-mcp__get_file_symbols",
].join(",");

export const scenarios: BenchmarkScenario[] = [
	{
		id: "with-mcp",
		name: "WITH MCP",
		cliFlags: [
			"--allowedTools",
			`${MCP_TOOLS},Read,Glob,Grep`,
		],
		description: "Claude has access to ts-graph-mcp tools for graph queries",
	},
	{
		id: "without-mcp",
		name: "WITHOUT MCP",
		cliFlags: ["--disallowedTools", "mcp__ts-graph-mcp__*"],
		description: "Claude must read files manually to trace relationships",
	},
];

/**
 * Get a scenario by ID.
 */
export function getScenario(id: string): BenchmarkScenario | undefined {
	return scenarios.find((s) => s.id === id);
}
