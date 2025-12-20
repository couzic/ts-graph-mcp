import type Database from "better-sqlite3";
import { resolveSymbol } from "../shared/resolveSymbol.js";
import type { SymbolQuery } from "../shared/SymbolQuery.js";
import { formatAmbiguous, formatNotFound, formatPath } from "./format.js";
import { queryPath } from "./query.js";

/**
 * Input parameters for find_path tool.
 */
export interface FindPathParams {
	from: SymbolQuery;
	to: SymbolQuery;
	maxDepth?: number;
	maxPaths?: number;
}

/**
 * MCP tool definition for find_path.
 */
export const findPathDefinition = {
	name: "find_path",
	description:
		"Find the shortest path between two nodes in the code graph. Returns the path with nodes and edges.",
	inputSchema: {
		type: "object" as const,
		properties: {
			from: {
				type: "object",
				description: "Source symbol query",
				properties: {
					symbol: {
						type: "string",
						description: "Symbol name (e.g., 'formatDate', 'User.save')",
					},
					file: {
						type: "string",
						description: "Narrow scope to a file",
					},
					module: {
						type: "string",
						description: "Narrow scope to a module",
					},
					package: {
						type: "string",
						description: "Narrow scope to a package",
					},
				},
				required: ["symbol"],
			},
			to: {
				type: "object",
				description: "Target symbol query",
				properties: {
					symbol: {
						type: "string",
						description: "Symbol name (e.g., 'formatDate', 'User.save')",
					},
					file: {
						type: "string",
						description: "Narrow scope to a file",
					},
					module: {
						type: "string",
						description: "Narrow scope to a module",
					},
					package: {
						type: "string",
						description: "Narrow scope to a package",
					},
				},
				required: ["symbol"],
			},
			maxDepth: {
				type: "number",
				description: "Maximum path length (1-100, default: 20)",
			},
			maxPaths: {
				type: "number",
				description: "Maximum paths to return (1-10, default: 3)",
			},
		},
		required: ["from", "to"],
	},
};

/**
 * Execute the find_path tool.
 *
 * @param db - Database connection
 * @param params - Tool parameters
 * @returns Formatted string for LLM consumption
 */
export function executeFindPath(
	db: Database.Database,
	params: FindPathParams,
): string {
	// Resolve 'from' symbol
	const fromResult = resolveSymbol(db, params.from);
	if (fromResult.status === "not_found") {
		return formatNotFound(
			`from.symbol: ${params.from.symbol}`,
			fromResult.suggestions,
		);
	}
	if (fromResult.status === "ambiguous") {
		return formatAmbiguous(
			`from.symbol: ${params.from.symbol}`,
			fromResult.candidates,
		);
	}

	// Resolve 'to' symbol
	const toResult = resolveSymbol(db, params.to);
	if (toResult.status === "not_found") {
		return formatNotFound(
			`to.symbol: ${params.to.symbol}`,
			toResult.suggestions,
		);
	}
	if (toResult.status === "ambiguous") {
		return formatAmbiguous(
			`to.symbol: ${params.to.symbol}`,
			toResult.candidates,
		);
	}

	const sourceId = fromResult.node.id;
	const targetId = toResult.node.id;

	// Query path(s)
	const path = queryPath(db, sourceId, targetId);
	return formatPath(fromResult.node, toResult.node, path);
}
