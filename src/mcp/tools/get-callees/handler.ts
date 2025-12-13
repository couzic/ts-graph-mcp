import type Database from "better-sqlite3";
import { formatCallees } from "./format.js";
import { queryCallees } from "./query.js";

/**
 * Input parameters for get_callees tool.
 */
export interface GetCalleesParams {
	nodeId: string;
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
	const maxDepth = params.maxDepth ?? 100;
	const nodes = queryCallees(db, params.nodeId, maxDepth);
	return formatCallees(params.nodeId, nodes);
}
