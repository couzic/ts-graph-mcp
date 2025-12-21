import type Database from "better-sqlite3";
import { resolveSymbol } from "../shared/resolveSymbol.js";
import type { SymbolQuery } from "../shared/SymbolQuery.js";
import { formatAmbiguous, formatNotFound, formatPath } from "./format.js";
import { queryPath } from "./query.js";

/**
 * Input parameters for findPath tool.
 */
export interface FindPathParams {
	from: SymbolQuery;
	to: SymbolQuery;
	maxDepth?: number;
	maxPaths?: number;
}

/**
 * MCP tool definition for findPath.
 */
export const findPathDefinition = {
	name: "findPath",
	description:
		"Find how two symbols are connected. Returns the call/import chain from source to target. Use this to answer 'How does function A eventually call function B?' or 'What's the dependency path between these modules?'",
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
 * Execute the findPath tool.
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
