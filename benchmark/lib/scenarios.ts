/**
 * Shared benchmark scenarios: WITH vs WITHOUT MCP tools.
 * Used by all test project benchmarks.
 */

import type { BenchmarkScenario } from "./types.js";

/**
 * Benchmark scenarios compare Claude's performance WITH vs WITHOUT MCP tools.
 *
 * Design principle: Both scenarios have access to ALL standard Claude Code tools
 * (Read, Glob, Grep, LSP, Task, etc.). The only difference is whether ts-graph-mcp
 * tools are available. This measures: "Does adding MCP improve performance?"
 */
export const scenarios: BenchmarkScenario[] = [
	{
		id: "with-mcp",
		name: "WITH MCP",
		cliFlags: ["--allowedTools", "mcp__ts-graph-mcp__*"],
		description: "All tools available, including ts-graph-mcp",
	},
	{
		id: "without-mcp",
		name: "WITHOUT MCP",
		cliFlags: [],
		description: "All tools available, EXCEPT ts-graph-mcp",
	},
];
