import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
	CallToolRequestSchema,
	ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import type Database from "better-sqlite3";
import {
	type AnalyzeImpactParams,
	analyzeImpactDefinition,
	executeAnalyzeImpact,
} from "../tools/analyze-impact/handler.js";
import {
	executeFindPath,
	type FindPathParams,
	findPathDefinition,
} from "../tools/find-path/handler.js";
import {
	executeIncomingCallsDeep,
	type IncomingCallsDeepParams,
	incomingCallsDeepDefinition,
} from "../tools/incoming-calls-deep/handler.js";
import {
	executeIncomingPackageDeps,
	type IncomingPackageDepsParams,
	incomingPackageDepsDefinition,
} from "../tools/incoming-package-deps/handler.js";
import {
	executeOutgoingCallsDeep,
	type OutgoingCallsDeepParams,
	outgoingCallsDeepDefinition,
} from "../tools/outgoing-calls-deep/handler.js";
import {
	executeOutgoingPackageDeps,
	type OutgoingPackageDepsParams,
	outgoingPackageDepsDefinition,
} from "../tools/outgoing-package-deps/handler.js";

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

	// Register all tools
	server.setRequestHandler(ListToolsRequestSchema, async () => {
		return {
			tools: [
				incomingCallsDeepDefinition,
				outgoingCallsDeepDefinition,
				incomingPackageDepsDefinition,
				outgoingPackageDepsDefinition,
				analyzeImpactDefinition,
				findPathDefinition,
			],
		};
	});

	// Tool request handler
	server.setRequestHandler(CallToolRequestSchema, async (request) => {
		const { name, arguments: args } = request.params;

		try {
			switch (name) {
				case "incomingCallsDeep": {
					const params = args as unknown as IncomingCallsDeepParams;
					const result = executeIncomingCallsDeep(db, params);
					return {
						content: [{ type: "text" as const, text: result }],
					};
				}

				case "outgoingCallsDeep": {
					const params = args as unknown as OutgoingCallsDeepParams;
					const result = executeOutgoingCallsDeep(db, params);
					return {
						content: [{ type: "text" as const, text: result }],
					};
				}

				case "analyzeImpact": {
					const params = args as unknown as AnalyzeImpactParams;
					const result = executeAnalyzeImpact(db, params);
					return {
						content: [{ type: "text" as const, text: result }],
					};
				}

				case "findPath": {
					const params = args as unknown as FindPathParams;
					const result = executeFindPath(db, params);
					return {
						content: [{ type: "text" as const, text: result }],
					};
				}

				case "incomingPackageDeps": {
					const params = args as unknown as IncomingPackageDepsParams;
					const result = executeIncomingPackageDeps(db, params);
					return {
						content: [{ type: "text" as const, text: result }],
					};
				}

				case "outgoingPackageDeps": {
					const params = args as unknown as OutgoingPackageDepsParams;
					const result = executeOutgoingPackageDeps(db, params);
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
