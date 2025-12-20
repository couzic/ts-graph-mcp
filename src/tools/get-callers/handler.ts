import type Database from "better-sqlite3";
import { formatAmbiguous, formatNotFound } from "../shared/errorFormatters.js";
import { resolveSymbol } from "../shared/resolveSymbol.js";
import { formatCallers } from "./format.js";
import { type QueryCallersOptions, queryCallers } from "./query.js";

/**
 * Input parameters for get_callers tool.
 */
export interface GetCallersParams {
	symbol: string;
	file?: string;
	module?: string;
	package?: string;
	maxDepth?: number;
}

/**
 * MCP tool definition for get_callers.
 */
export const getCallersDefinition = {
	name: "get_callers",
	description:
		"Find all functions/methods that call the target. Returns nodes that call the specified function/method.",
	inputSchema: {
		type: "object" as const,
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
			maxDepth: {
				type: "number",
				description:
					"Optional: Maximum traversal depth for transitive callers (1-100)",
			},
		},
		required: ["symbol"],
	},
};

/**
 * Execute the get_callers tool.
 *
 * @param db - Database connection
 * @param params - Tool parameters
 * @returns Formatted string for LLM consumption
 */
export function executeGetCallers(
	db: Database.Database,
	params: GetCallersParams,
): string {
	const result = resolveSymbol(db, params);

	if (result.status === "not_found") {
		return formatNotFound(params.symbol, result.suggestions);
	}

	if (result.status === "ambiguous") {
		return formatAmbiguous(params.symbol, result.candidates);
	}

	// result.status === "unique"
	const nodeId = result.node.id;
	const options: QueryCallersOptions = {};
	if (params.maxDepth !== undefined) {
		options.maxDepth = params.maxDepth;
	}

	const nodes = queryCallers(db, nodeId, options);
	return formatCallers(result.node, nodes);
}
