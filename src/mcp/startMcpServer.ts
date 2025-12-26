import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import type Database from "better-sqlite3";
import {
  type DependenciesOfParams,
  dependenciesOfDefinition,
  executeDependenciesOf,
} from "../tools/dependencies-of/handler.js";
import {
  type DependentsOfParams,
  dependentsOfDefinition,
  executeDependentsOf,
} from "../tools/dependents-of/handler.js";
import {
  executePathsBetween,
  type PathsBetweenParams,
  pathsBetweenDefinition,
} from "../tools/paths-between/handler.js";

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
  const server = new Server(
    {
      name: "ts-graph-mcp",
      version: "0.1.0",
    },
    {
      capabilities: {
        tools: {},
      },
    },
  );

  // Register all tools
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: [
        dependenciesOfDefinition,
        dependentsOfDefinition,
        pathsBetweenDefinition,
      ],
    };
  });

  // Tool request handler
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      switch (name) {
        case "dependenciesOf": {
          const params = args as unknown as DependenciesOfParams;
          const result = executeDependenciesOf(db, params, projectRoot);
          return {
            content: [{ type: "text" as const, text: result }],
          };
        }

        case "dependentsOf": {
          const params = args as unknown as DependentsOfParams;
          const result = executeDependentsOf(db, params, projectRoot);
          return {
            content: [{ type: "text" as const, text: result }],
          };
        }

        case "pathsBetween": {
          const params = args as unknown as PathsBetweenParams;
          const result = executePathsBetween(db, params, projectRoot);
          return {
            content: [{ type: "text" as const, text: result }],
          };
        }

        default:
          return {
            content: [
              {
                type: "text" as const,
                text: `Unknown tool: ${name}`,
              },
            ],
            isError: true,
          };
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        content: [
          {
            type: "text" as const,
            text: `Error executing ${name}: ${message}`,
          },
        ],
        isError: true,
      };
    }
  });

  // Start the server
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
