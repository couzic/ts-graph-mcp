import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
	CallToolRequestSchema,
	ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { encode } from "@toon-format/toon";
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

const NODE_TYPE_PLURALS: Record<string, string> = {
	Function: "functions",
	Class: "classes",
	Method: "methods",
	Interface: "interfaces",
	TypeAlias: "typeAliases",
	Variable: "variables",
	File: "files",
	Property: "properties",
};

/**
 * Default values for optional fields by node type.
 * TOON requires all objects in an array to have identical keys for condensed format.
 * Missing optional fields cause TOON to fall back to verbose format.
 */
const NODE_TYPE_DEFAULTS: Record<string, Record<string, unknown>> = {
	Function: { parameters: "", returnType: "", async: false },
	Method: {
		parameters: "",
		returnType: "",
		async: false,
		visibility: "",
		static: false,
	},
	Class: { extends: "", implements: "" },
	Interface: { extends: "" },
	TypeAlias: { aliasedType: "" },
	Variable: { variableType: "", isConst: false },
	File: { extension: "" },
	Property: {
		propertyType: "",
		optional: false,
		readonly: false,
		visibility: "",
		static: false,
	},
};

/**
 * Flatten a node for TOON encoding by converting arrays to strings
 * and ensuring all optional fields have default values.
 * This ensures all nodes of the same type have identical keys, enabling table format.
 */
function flattenNodeForToon(node: Node): Record<string, unknown> {
	const result: Record<string, unknown> = {};

	// Start with default values for this node type
	const defaults = NODE_TYPE_DEFAULTS[node.type] ?? {};
	for (const [key, defaultValue] of Object.entries(defaults)) {
		result[key] = defaultValue;
	}

	// Override with actual values from the node
	// Skip 'type' field - it's redundant when nodes are grouped by type (functions[], classes[], etc.)
	for (const [key, value] of Object.entries(node)) {
		if (key === "type") continue;
		if (Array.isArray(value)) {
			// Convert arrays to compact string representation
			// e.g., parameters: [{name: "x", type: "string"}] -> "x:string"
			if (key === "parameters") {
				result[key] = value
					.map((p: { name: string; type?: string }) =>
						p.type ? `${p.name}:${p.type}` : p.name,
					)
					.join(", ");
			} else if (key === "implements" || key === "extends") {
				result[key] = value.join(", ");
			} else if (key === "importedSymbols") {
				result[key] = value.join(", ");
			} else {
				result[key] = JSON.stringify(value);
			}
		} else {
			result[key] = value;
		}
	}
	return result;
}

/**
 * Group nodes by type for TOON-optimal encoding.
 * Each array contains uniform objects with flattened arrays, enabling condensed table format.
 */
export function groupNodesByType(nodes: Node[]) {
	const groups: Record<string, Record<string, unknown>[]> = {};
	for (const node of nodes) {
		const key = NODE_TYPE_PLURALS[node.type] ?? node.type.toLowerCase();
		if (!groups[key]) groups[key] = [];
		groups[key].push(flattenNodeForToon(node));
	}
	return groups;
}

/**
 * Flatten an edge for TOON-optimal encoding.
 * Ensures all edges have the same keys (missing optional fields get empty string).
 */
function flattenEdgeForToon(edge: Edge): Record<string, unknown> {
	return {
		source: edge.source,
		target: edge.target,
		type: edge.type,
		callCount: edge.callCount ?? "",
	};
}

/**
 * Format a subgraph for TOON-optimal encoding.
 * Groups nodes by type (so each array is uniform) and flattens edges.
 */
export function formatSubgraphForToon(subgraph: {
	center: Node;
	nodes: Node[];
	edges: Edge[];
}) {
	return {
		center: flattenNodeForToon(subgraph.center),
		nodeCount: subgraph.nodes.length,
		edgeCount: subgraph.edges.length,
		...groupNodesByType(subgraph.nodes),
		edges: subgraph.edges.map(flattenEdgeForToon),
	};
}

/**
 * Format a path result for TOON-optimal encoding.
 * Flattens edges so array has uniform schema.
 */
export function formatPathForToon(
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
			found: false,
			message: "No path found between the specified nodes",
		};
	}
	return {
		found: true,
		path: {
			start: path.start,
			end: path.end,
			nodes: path.nodes,
			edges: path.edges.map(flattenEdgeForToon),
			length: path.length,
		},
	};
}

/**
 * Format a list of nodes as a TOON response (token-efficient format).
 * Nodes are grouped by type so each array is uniform for optimal compression.
 */
function formatNodesResponse(nodes: Node[]) {
	const grouped = groupNodesByType(nodes);
	return {
		content: [
			{
				type: "text" as const,
				text: encode({
					count: nodes.length,
					...grouped,
				}),
			},
		],
	};
}

/**
 * Format a path as a TOON response (token-efficient format).
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
	return {
		content: [
			{
				type: "text" as const,
				text: encode(formatPathForToon(path)),
			},
		],
	};
}

/**
 * Format a subgraph as a TOON response with a Mermaid diagram.
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
				text: encode(formatSubgraphForToon(subgraph)),
			},
			{
				type: "text" as const,
				text: `\n\nMermaid Diagram:\n\`\`\`mermaid\n${mermaid}\n\`\`\``,
			},
		],
	};
}
