import type Database from "better-sqlite3";
import { validateNodeExists } from "../shared/validateNodeExists.js";
import { formatImpactNodes } from "./format.js";
import { queryImpactedNodes } from "./query.js";

/**
 * Input parameters for get_impact tool.
 */
export interface GetImpactParams {
	nodeId: string;
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
			nodeId: {
				type: "string",
				description:
					"Node ID to analyze impact for (e.g., 'src/types.ts:User')",
			},
			maxDepth: {
				type: "number",
				description:
					"Optional: Maximum traversal depth for transitive dependencies (1-100)",
			},
		},
		required: ["nodeId"],
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
	const validation = validateNodeExists(db, params.nodeId);
	if (!validation.valid) {
		return validation.error;
	}

	const nodes = queryImpactedNodes(db, params.nodeId, {
		maxDepth: params.maxDepth,
	});
	return formatImpactNodes(params.nodeId, nodes);
}
