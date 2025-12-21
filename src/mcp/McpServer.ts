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
	executeIncomingExtends,
	type IncomingExtendsParams,
	incomingExtendsDefinition,
} from "../tools/incoming-extends/handler.js";
import {
	executeIncomingImplements,
	type IncomingImplementsParams,
	incomingImplementsDefinition,
} from "../tools/incoming-implements/handler.js";
import {
	executeIncomingImports,
	type IncomingImportsParams,
	incomingImportsDefinition,
} from "../tools/incoming-imports/handler.js";
import {
	executeIncomingPackageDeps,
	type IncomingPackageDepsParams,
	incomingPackageDepsDefinition,
} from "../tools/incoming-package-deps/handler.js";
import {
	executeIncomingUsesType,
	type IncomingUsesTypeParams,
	incomingUsesTypeDefinition,
} from "../tools/incoming-uses-type/handler.js";
import {
	executeOutgoingCallsDeep,
	type OutgoingCallsDeepParams,
	outgoingCallsDeepDefinition,
} from "../tools/outgoing-calls-deep/handler.js";
import {
	executeOutgoingExtends,
	type OutgoingExtendsParams,
	outgoingExtendsDefinition,
} from "../tools/outgoing-extends/handler.js";
import {
	executeOutgoingImplements,
	type OutgoingImplementsParams,
	outgoingImplementsDefinition,
} from "../tools/outgoing-implements/handler.js";
import {
	executeOutgoingImports,
	type OutgoingImportsParams,
	outgoingImportsDefinition,
} from "../tools/outgoing-imports/handler.js";
import {
	executeOutgoingPackageDeps,
	type OutgoingPackageDepsParams,
	outgoingPackageDepsDefinition,
} from "../tools/outgoing-package-deps/handler.js";
import {
	executeOutgoingUsesType,
	type OutgoingUsesTypeParams,
	outgoingUsesTypeDefinition,
} from "../tools/outgoing-uses-type/handler.js";

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
				incomingImportsDefinition,
				outgoingImportsDefinition,
				incomingPackageDepsDefinition,
				outgoingPackageDepsDefinition,
				incomingUsesTypeDefinition,
				outgoingUsesTypeDefinition,
				incomingExtendsDefinition,
				incomingImplementsDefinition,
				outgoingExtendsDefinition,
				outgoingImplementsDefinition,
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

				case "incomingImports": {
					const params = args as unknown as IncomingImportsParams;
					const result = executeIncomingImports(db, params);
					return {
						content: [{ type: "text" as const, text: result }],
					};
				}

				case "outgoingImports": {
					const params = args as unknown as OutgoingImportsParams;
					const result = executeOutgoingImports(db, params);
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

				case "outgoingExtends": {
					const params = args as unknown as OutgoingExtendsParams;
					const result = executeOutgoingExtends(db, params);
					return {
						content: [{ type: "text" as const, text: result }],
					};
				}

				case "incomingUsesType": {
					const params = args as unknown as IncomingUsesTypeParams;
					const result = executeIncomingUsesType(db, params);
					return {
						content: [{ type: "text" as const, text: result }],
					};
				}

				case "incomingExtends": {
					const params = args as unknown as IncomingExtendsParams;
					const result = executeIncomingExtends(db, params);
					return {
						content: [{ type: "text" as const, text: result }],
					};
				}

				case "incomingImplements": {
					const params = args as unknown as IncomingImplementsParams;
					const result = executeIncomingImplements(db, params);
					return {
						content: [{ type: "text" as const, text: result }],
					};
				}

				case "outgoingImplements": {
					const params = args as unknown as OutgoingImplementsParams;
					const result = executeOutgoingImplements(db, params);
					return {
						content: [{ type: "text" as const, text: result }],
					};
				}

				case "outgoingUsesType": {
					const params = args as unknown as OutgoingUsesTypeParams;
					const result = executeOutgoingUsesType(db, params);
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
