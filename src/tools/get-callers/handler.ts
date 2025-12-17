import type Database from "better-sqlite3";
import { validateNodeExists } from "../shared/validateNodeExists.js";
import { formatCallers } from "./format.js";
import { type QueryCallersOptions, queryCallers } from "./query.js";

/**
 * Input parameters for get_callers tool.
 */
export interface GetCallersParams {
	nodeId: string;
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
	const validation = validateNodeExists(db, params.nodeId);
	if (!validation.valid) {
		return validation.error;
	}

	const options: QueryCallersOptions = {};
	if (params.maxDepth !== undefined) {
		options.maxDepth = params.maxDepth;
	}

	const nodes = queryCallers(db, params.nodeId, options);
	return formatCallers(params.nodeId, nodes);
}
