import type Database from "better-sqlite3";
import { formatAmbiguous, formatNotFound } from "../shared/errorFormatters.js";
import { resolveSymbol } from "../shared/resolveSymbol.js";
import { formatImpactNodes } from "./format.js";
import { queryImpactedNodes } from "./query.js";

/**
 * Input parameters for analyzeImpact tool.
 */
export interface AnalyzeImpactParams {
	symbol: string;
	file?: string;
	module?: string;
	package?: string;
	maxDepth?: number;
}

/**
 * MCP tool definition for analyzeImpact.
 */
export const analyzeImpactDefinition = {
	name: "analyzeImpact",
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
 * Execute the analyzeImpact tool.
 *
 * @param db - Database connection
 * @param params - Tool parameters
 * @returns Formatted string for LLM consumption
 */
export function executeAnalyzeImpact(
	db: Database.Database,
	params: AnalyzeImpactParams,
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
