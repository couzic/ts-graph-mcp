import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type Database from "better-sqlite3";
import { z } from "zod";
import { dependenciesOf } from "../tools/dependencies-of/dependenciesOf.js";
import { dependentsOf } from "../tools/dependents-of/dependentsOf.js";
import { pathsBetween } from "../tools/paths-between/pathsBetween.js";

/**
 * Start the MCP server that exposes TypeScript code graph queries as tools.
 *
 * @param db - Database connection for direct queries
 * @param projectRoot - Project root directory for resolving file paths
 */
export async function startMcpServer(
  db: Database.Database,
  projectRoot: string,
): Promise<void> {
  const server = new McpServer({
    name: "ts-graph-mcp",
    version: "0.1.0",
  });

  // Shared Zod schemas for tool parameters
  const symbolLocationSchema = {
    file_path: z
      .string()
      .describe("File path containing the symbol (e.g., 'src/utils.ts')"),
    symbol: z
      .string()
      .describe("Symbol name (e.g., 'formatDate', 'User.save')"),
  };

  // Register dependenciesOf tool
  server.registerTool(
    "dependenciesOf",
    {
      description:
        "Find all code that a symbol depends on (forward dependencies). Traces the full call chain with code snippets — use this to understand what happens when a function is called, or to trace execution flow. Answers: 'What does this call?', 'What happens when X runs?', 'What does this symbol depend on?' Returns a Graph section showing the dependency chain and a Nodes section with file locations and code snippets. Prefer this over reading multiple files when tracing calls.",
      inputSchema: symbolLocationSchema,
    },
    ({ file_path, symbol }) => {
      try {
        const result = dependenciesOf(db, projectRoot, file_path, symbol);
        return { content: [{ type: "text", text: result }] };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          content: [{ type: "text", text: `Error: ${message}` }],
          isError: true,
        };
      }
    },
  );

  // Register dependentsOf tool
  server.registerTool(
    "dependentsOf",
    {
      description:
        "Find all code that depends on a symbol (reverse dependencies). Shows all callers transitively with code snippets — use this to understand impact before changing code. Answers: 'Who calls this?', 'What would break if I changed this?', 'Who depends on this symbol?' Returns a Graph section showing the dependency chain and a Nodes section with file locations and code snippets. Prefer this over reading multiple files when finding usages.",
      inputSchema: symbolLocationSchema,
    },
    ({ file_path, symbol }) => {
      try {
        const result = dependentsOf(db, projectRoot, file_path, symbol);
        return { content: [{ type: "text", text: result }] };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          content: [{ type: "text", text: `Error: ${message}` }],
          isError: true,
        };
      }
    },
  );

  // Register pathsBetween tool
  server.registerTool(
    "pathsBetween",
    {
      description:
        "Find how two symbols connect through the code graph. Use this to answer 'How does A reach B?' or 'What's the dependency path between these symbols?' Bidirectional: finds the path regardless of which direction you specify. The arrows in the output show the actual direction.",
      inputSchema: {
        from: z
          .object({
            file_path: z
              .string()
              .describe("File path (e.g., 'src/api/handler.ts')"),
            symbol: z.string().describe("Symbol name (e.g., 'handleRequest')"),
          })
          .describe("Source symbol"),
        to: z
          .object({
            file_path: z
              .string()
              .describe("File path (e.g., 'src/db/queries.ts')"),
            symbol: z.string().describe("Symbol name (e.g., 'executeQuery')"),
          })
          .describe("Target symbol"),
      },
    },
    ({ from, to }) => {
      try {
        const result = pathsBetween(db, projectRoot, from, to);
        return { content: [{ type: "text", text: result }] };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          content: [{ type: "text", text: `Error: ${message}` }],
          isError: true,
        };
      }
    },
  );

  // Start the server
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
