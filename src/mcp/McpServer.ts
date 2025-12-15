import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
	CallToolRequestSchema,
	ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import type Database from "better-sqlite3";
import {
	executeFindPath,
	type FindPathParams,
	findPathDefinition,
} from "../tools/find-path/handler.js";
import {
	executeGetCallees,
	type GetCalleesParams,
	getCalleesDefinition,
} from "../tools/get-callees/handler.js";
import {
	executeGetCallers,
	type GetCallersParams,
	getCallersDefinition,
} from "../tools/get-callers/handler.js";
import {
	executeGetFileSymbols,
	type GetFileSymbolsParams,
	getFileSymbolsDefinition,
} from "../tools/get-file-symbols/handler.js";
import {
	executeGetImpact,
	type GetImpactParams,
	getImpactDefinition,
} from "../tools/get-impact/handler.js";
import {
	executeGetNeighbors,
	type GetNeighborsParams,
	getNeighborsDefinition,
} from "../tools/get-neighbors/handler.js";
import {
	executeSearchNodes,
	type SearchNodesParams,
	searchNodesDefinition,
} from "../tools/search-nodes/handler.js";

/**
 * Start the MCP server that exposes TypeScript code graph queries as tools.
 *
 * @param db - Database connection for direct queries
 */
export async function startMcpServer(db: Database.Database): Promise<void> {
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

	// Tool 1: search_nodes
	server.setRequestHandler(ListToolsRequestSchema, async () => {
		return {
			tools: [
				searchNodesDefinition,
				getCallersDefinition,
				getCalleesDefinition,
				getImpactDefinition,
				findPathDefinition,
				getNeighborsDefinition,
				getFileSymbolsDefinition,
			],
		};
	});

	// Tool request handler
	server.setRequestHandler(CallToolRequestSchema, async (request) => {
		const { name, arguments: args } = request.params;

		try {
			switch (name) {
				case "search_nodes": {
					const params = args as unknown as SearchNodesParams;
					const result = executeSearchNodes(db, params);
					return {
						content: [{ type: "text" as const, text: result }],
					};
				}

				case "get_callers": {
					const params = args as unknown as GetCallersParams;
					const result = executeGetCallers(db, params);
					return {
						content: [{ type: "text" as const, text: result }],
					};
				}

				case "get_callees": {
					const params = args as unknown as GetCalleesParams;
					const result = executeGetCallees(db, params);
					return {
						content: [{ type: "text" as const, text: result }],
					};
				}

				case "get_impact": {
					const params = args as unknown as GetImpactParams;
					const result = executeGetImpact(db, params);
					return {
						content: [{ type: "text" as const, text: result }],
					};
				}

				case "find_path": {
					const params = args as unknown as FindPathParams;
					const result = executeFindPath(db, params);
					return {
						content: [{ type: "text" as const, text: result }],
					};
				}

				case "get_neighbors": {
					const params = args as unknown as GetNeighborsParams;
					const result = executeGetNeighbors(db, params);
					return {
						content: [{ type: "text" as const, text: result }],
					};
				}

				case "get_file_symbols": {
					const params = args as unknown as GetFileSymbolsParams;
					const result = executeGetFileSymbols(db, params);
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
