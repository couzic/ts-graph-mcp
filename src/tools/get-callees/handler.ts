import type Database from "better-sqlite3";
import { formatAmbiguous, formatNotFound } from "../shared/errorFormatters.js";
import { resolveSymbol } from "../shared/resolveSymbol.js";
import { formatCallees } from "./format.js";
import { queryCallees } from "./query.js";

/**
 * Input parameters for get_callees tool.
 */
export interface GetCalleesParams {
	symbol: string;
	file?: string;
	module?: string;
	package?: string;
	maxDepth?: number;
}

/**
 * MCP tool definition for get_callees.
 */
export const getCalleesDefinition = {
	name: "get_callees",
	description:
		"Find all functions/methods that the source calls. Returns nodes called by the specified function/method.",
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
					"Optional: Maximum traversal depth for transitive callees (1-100)",
			},
		},
		required: ["symbol"],
	},
};

/**
 * Execute the get_callees tool.
 *
 * @param db - Database connection
 * @param params - Tool parameters
 * @returns Formatted string for LLM consumption
 */
export function executeGetCallees(
	db: Database.Database,
	params: GetCalleesParams,
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
	const maxDepth = params.maxDepth ?? 100;
	const nodes = queryCallees(db, nodeId, maxDepth);
	return formatCallees(result.node, nodes);
}
