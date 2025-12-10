import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
	CallToolRequestSchema,
	ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import type { DbReader } from "../db/DbReader.js";
import { subgraphToMermaid } from "../db/SubgraphToMermaid.js";
import type {
	Edge,
	NeighborOptions,
	Node,
	SearchFilters,
	TraversalOptions,
} from "../db/Types.js";

/**
 * Start the MCP server that exposes TypeScript code graph queries as tools.
 *
 * @param reader - Database reader for querying the code graph
 */
export async function startMcpServer(reader: DbReader): Promise<void> {
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
				{
					name: "search_nodes",
					description:
						"Search for nodes by name pattern. Supports glob patterns (*, ?). Returns matching nodes with their metadata.",
					inputSchema: {
						type: "object",
						properties: {
							pattern: {
								type: "string",
								description: "Search pattern (e.g., 'handle*', 'User*Service')",
							},
							nodeType: {
								type: "string",
								description:
									"Optional: Filter by node type (Function, Class, Method, Interface, TypeAlias, Variable, File, Property)",
							},
							module: {
								type: "string",
								description: "Optional: Filter by module name",
							},
							package: {
								type: "string",
								description: "Optional: Filter by package name",
							},
							exported: {
								type: "boolean",
								description: "Optional: Filter by export status",
							},
						},
						required: ["pattern"],
					},
				},
				{
					name: "get_callers",
					description:
						"Find all functions/methods that call the target. Returns nodes that call the specified function/method.",
					inputSchema: {
						type: "object",
						properties: {
							nodeId: {
								type: "string",
								description:
									"Node ID of the function/method (e.g., 'src/utils.ts:formatDate')",
							},
							maxDepth: {
								type: "number",
								description:
									"Optional: Maximum traversal depth for transitive callers (1-100)",
							},
						},
						required: ["nodeId"],
					},
				},
				{
					name: "get_callees",
					description:
						"Find all functions/methods that the source calls. Returns nodes called by the specified function/method.",
					inputSchema: {
						type: "object",
						properties: {
							nodeId: {
								type: "string",
								description:
									"Node ID of the function/method (e.g., 'src/utils.ts:formatDate')",
							},
							maxDepth: {
								type: "number",
								description:
									"Optional: Maximum traversal depth for transitive callees (1-100)",
							},
						},
						required: ["nodeId"],
					},
				},
				{
					name: "get_impact",
					description:
						"Impact analysis: find all code affected by changes to target. Returns all nodes that depend on the specified node.",
					inputSchema: {
						type: "object",
						properties: {
							nodeId: {
								type: "string",
								description:
									"Node ID to analyze impact for (e.g., 'src/types.ts:User')",
							},
							maxDepth: {
								type: "number",
								description:
									"Optional: Maximum traversal depth for transitive dependencies (1-100)",
							},
						},
						required: ["nodeId"],
					},
				},
				{
					name: "find_path",
					description:
						"Find the shortest path between two nodes in the code graph. Returns the path with nodes and edges.",
					inputSchema: {
						type: "object",
						properties: {
							sourceId: {
								type: "string",
								description:
									"Starting node ID (e.g., 'src/api/handler.ts:createUser')",
							},
							targetId: {
								type: "string",
								description: "Ending node ID (e.g., 'src/db/user.ts:saveUser')",
							},
						},
						required: ["sourceId", "targetId"],
					},
				},
				{
					name: "get_neighbors",
					description:
						"Find all nodes within a given distance from a center node. Returns a subgraph containing the neighborhood with a Mermaid diagram.",
					inputSchema: {
						type: "object",
						properties: {
							nodeId: {
								type: "string",
								description:
									"Center node ID (e.g., 'src/services/UserService.ts:UserService')",
							},
							distance: {
								type: "number",
								description:
									"Distance from center node (number of edges, 1-100, default: 1)",
							},
							direction: {
								type: "string",
								description:
									"Direction to traverse: 'outgoing', 'incoming', or 'both' (default: 'both')",
								enum: ["outgoing", "incoming", "both"],
							},
						},
						required: ["nodeId"],
					},
				},
				{
					name: "get_file_symbols",
					description:
						"Get all symbols (functions, classes, interfaces, etc.) defined in a file. Returns all nodes in the specified file.",
					inputSchema: {
						type: "object",
						properties: {
							filePath: {
								type: "string",
								description:
									"Relative file path (e.g., 'src/utils/helpers.ts')",
							},
						},
						required: ["filePath"],
					},
				},
			],
		};
	});

	// Tool request handler
	server.setRequestHandler(CallToolRequestSchema, async (request) => {
		const { name, arguments: args } = request.params;

		try {
			switch (name) {
				case "search_nodes": {
					const schema = z.object({
						pattern: z.string(),
						nodeType: z
							.enum([
								"Function",
								"Class",
								"Method",
								"Interface",
								"TypeAlias",
								"Variable",
								"File",
								"Property",
							])
							.optional(),
						module: z.string().optional(),
						package: z.string().optional(),
						exported: z.boolean().optional(),
					});
					const params = schema.parse(args);

					const filters: SearchFilters = {};
					if (params.nodeType) {
						filters.nodeType = params.nodeType;
					}
					if (params.module) {
						filters.module = params.module;
					}
					if (params.package) {
						filters.package = params.package;
					}
					if (params.exported !== undefined) {
						filters.exported = params.exported;
					}

					const nodes = await reader.searchNodes(params.pattern, filters);
					return formatNodesResponse(nodes);
				}

				case "get_callers": {
					const schema = z.object({
						nodeId: z.string(),
						maxDepth: z.number().int().min(1).max(100).optional(),
					});
					const params = schema.parse(args);

					const options: TraversalOptions = {};
					if (params.maxDepth !== undefined) {
						options.maxDepth = params.maxDepth;
					}

					const nodes = await reader.getCallersOf(params.nodeId, options);
					return formatNodesResponse(nodes);
				}

				case "get_callees": {
					const schema = z.object({
						nodeId: z.string(),
						maxDepth: z.number().int().min(1).max(100).optional(),
					});
					const params = schema.parse(args);

					const options: TraversalOptions = {};
					if (params.maxDepth !== undefined) {
						options.maxDepth = params.maxDepth;
					}

					const nodes = await reader.getCalleesOf(params.nodeId, options);
					return formatNodesResponse(nodes);
				}

				case "get_impact": {
					const schema = z.object({
						nodeId: z.string(),
						maxDepth: z.number().int().min(1).max(100).optional(),
					});
					const params = schema.parse(args);

					const options: TraversalOptions = {};
					if (params.maxDepth !== undefined) {
						options.maxDepth = params.maxDepth;
					}

					const nodes = await reader.getImpactedBy(params.nodeId, options);
					return formatNodesResponse(nodes);
				}

				case "find_path": {
					const schema = z.object({
						sourceId: z.string(),
						targetId: z.string(),
					});
					const params = schema.parse(args);

					const path = await reader.getPathBetween(
						params.sourceId,
						params.targetId,
					);
					return formatPathResponse(path);
				}

				case "get_neighbors": {
					const schema = z.object({
						nodeId: z.string(),
						distance: z.number().int().min(1).max(100).optional(),
						direction: z.enum(["outgoing", "incoming", "both"]).optional(),
					});
					const params = schema.parse(args);

					const options: NeighborOptions = {
						distance: params.distance ?? 1,
						direction: params.direction ?? "both",
					};

					const subgraph = await reader.findNeighbors(params.nodeId, options);
					return formatSubgraphResponse(subgraph);
				}

				case "get_file_symbols": {
					const schema = z.object({
						filePath: z.string(),
					});
					const params = schema.parse(args);

					const nodes = await reader.getFileNodes(params.filePath);
					return formatNodesResponse(nodes);
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

/**
 * Format a list of nodes as a JSON response.
 */
function formatNodesResponse(nodes: Node[]) {
	return {
		content: [
			{
				type: "text" as const,
				text: JSON.stringify(
					{
						count: nodes.length,
						nodes,
					},
					null,
					2,
				),
			},
		],
	};
}

/**
 * Format a path as a JSON response.
 */
function formatPathResponse(
	path: {
		start: string;
		end: string;
		nodes: string[];
		edges: Edge[];
		length: number;
	} | null,
) {
	if (!path) {
		return {
			content: [
				{
					type: "text" as const,
					text: JSON.stringify(
						{
							found: false,
							message: "No path found between the specified nodes",
						},
						null,
						2,
					),
				},
			],
		};
	}

	return {
		content: [
			{
				type: "text" as const,
				text: JSON.stringify(
					{
						found: true,
						path,
					},
					null,
					2,
				),
			},
		],
	};
}

/**
 * Format a subgraph as a JSON response with a Mermaid diagram.
 */
function formatSubgraphResponse(subgraph: {
	center: Node;
	nodes: Node[];
	edges: Edge[];
}) {
	const mermaid = subgraphToMermaid(subgraph);

	return {
		content: [
			{
				type: "text" as const,
				text: JSON.stringify(
					{
						center: subgraph.center,
						nodeCount: subgraph.nodes.length,
						edgeCount: subgraph.edges.length,
						nodes: subgraph.nodes,
						edges: subgraph.edges,
					},
					null,
					2,
				),
			},
			{
				type: "text" as const,
				text: `\n\nMermaid Diagram:\n\`\`\`mermaid\n${mermaid}\n\`\`\``,
			},
		],
	};
}
