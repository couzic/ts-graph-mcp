import type Database from "better-sqlite3";
import { formatAmbiguous, formatNotFound } from "../shared/errorFormatters.js";
import { resolveSymbol } from "../shared/resolveSymbol.js";
import { formatCallees } from "./format.js";
import { queryCallees } from "./query.js";

/**
 * Input parameters for outgoingCallsDeep tool.
 */
export interface OutgoingCallsDeepParams {
	symbol: string;
	file?: string;
	module?: string;
	package?: string;
	maxDepth?: number;
}

/**
 * MCP tool definition for outgoingCallsDeep.
 */
export const outgoingCallsDeepDefinition = {
	name: "outgoingCallsDeep",
	description:
		"Find all functions or methods called by a symbol, including transitive callees. Use this to answer 'What does this function depend on?' or 'Trace the call chain from this entry point.'",
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
 * Execute the outgoingCallsDeep tool.
 *
 * @param db - Database connection
 * @param params - Tool parameters
 * @returns Formatted string for LLM consumption
 */
export function executeOutgoingCallsDeep(
	db: Database.Database,
	params: OutgoingCallsDeepParams,
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
