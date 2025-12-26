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
 *
 * How it works:
 * - Each sample project has two MCP config files:
 *   - `.mcp.json` - Configures ts-graph-mcp server
 *   - `.no-mcp.json` - Empty config (no MCP servers)
 * - `--strict-mcp-config` ensures ONLY the specified config is loaded
 *   (ignores global and project-level .mcp.json files)
 * - `--allowedTools` whitelists the MCP tools for execution
 *
 * This approach ensures:
 * 1. WITHOUT MCP has zero MCP overhead (no tool definitions visible to Claude)
 * 2. Fair comparison baseline (no rejected tool calls)
 * 3. Explicit, auditable configuration per scenario
 */
export const scenarios: BenchmarkScenario[] = [
  {
    id: "with-mcp",
    name: "WITH MCP",
    cliFlags: [
      "--mcp-config",
      ".mcp.json",
      "--strict-mcp-config",
      "--allowedTools",
      "mcp__ts-graph-mcp__*",
    ],
    description: "ts-graph-mcp tools available",
  },
  {
    id: "without-mcp",
    name: "WITHOUT MCP",
    cliFlags: ["--mcp-config", ".no-mcp.json", "--strict-mcp-config"],
    description: "No MCP servers - clean baseline",
  },
];
