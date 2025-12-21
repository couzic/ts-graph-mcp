import type Database from "better-sqlite3";
import { formatAmbiguous, formatNotFound } from "../shared/errorFormatters.js";
import { resolveSymbol } from "../shared/resolveSymbol.js";
import { formatCallers } from "./format.js";
import { type QueryCallersOptions, queryCallers } from "./query.js";

/**
 * Input parameters for incomingCallsDeep tool.
 */
export interface IncomingCallsDeepParams {
	symbol: string;
	file?: string;
	module?: string;
	package?: string;
	maxDepth?: number;
}

/**
 * MCP tool definition for incomingCallsDeep.
 */
export const incomingCallsDeepDefinition = {
	name: "incomingCallsDeep",
	description:
		"Find all callers of a function or method, including transitive callers (callers of callers). Use this to answer 'Who uses this function?' or 'What code calls this API?' Returns results grouped by file with depth (1=direct, 2+=transitive) and call count.",
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
 * Execute the incomingCallsDeep tool.
 *
 * @param db - Database connection
 * @param params - Tool parameters
 * @returns Formatted string for LLM consumption
 */
export function executeIncomingCallsDeep(
	db: Database.Database,
	params: IncomingCallsDeepParams,
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
