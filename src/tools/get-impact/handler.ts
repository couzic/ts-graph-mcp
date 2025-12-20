import type Database from "better-sqlite3";
import { formatAmbiguous, formatNotFound } from "../shared/errorFormatters.js";
import { resolveSymbol } from "../shared/resolveSymbol.js";
import { formatImpactNodes } from "./format.js";
import { queryImpactedNodes } from "./query.js";

/**
 * Input parameters for get_impact tool.
 */
export interface GetImpactParams {
	symbol: string;
	file?: string;
	module?: string;
	package?: string;
	maxDepth?: number;
}

/**
 * MCP tool definition for get_impact.
 */
export const getImpactDefinition = {
	name: "get_impact",
	description:
		"Impact analysis: find all code affected by changes to target. Returns all nodes that depend on the specified node.",
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
					"Optional: Maximum traversal depth for transitive dependencies (1-100)",
			},
		},
		required: ["symbol"],
	},
};

/**
 * Execute the get_impact tool.
 *
 * @param db - Database connection
 * @param params - Tool parameters
 * @returns Formatted string for LLM consumption
 */
export function executeGetImpact(
	db: Database.Database,
	params: GetImpactParams,
): string {
	const result = resolveSymbol(db, params);

	if (result.status === "not_found") {
		return formatNotFound(params.symbol, result.suggestions);
	}

	if (result.status === "ambiguous") {
		return formatAmbiguous(params.symbol, result.candidates);
	}

	const nodeId = result.node.id;
	const nodes = queryImpactedNodes(db, nodeId, {
		maxDepth: params.maxDepth,
	});
	return formatImpactNodes(result.node, nodes);
}
