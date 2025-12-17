import type Database from "better-sqlite3";
import { validateNodeExists } from "../shared/validateNodeExists.js";
import { formatPath } from "./format.js";
import { queryPath } from "./query.js";

/**
 * Input parameters for find_path tool.
 */
export interface FindPathParams {
	sourceId: string;
	targetId: string;
}

/**
 * MCP tool definition for find_path.
 */
export const findPathDefinition = {
	name: "find_path",
	description:
		"Find the shortest path between two nodes in the code graph. Returns the path with nodes and edges.",
	inputSchema: {
		type: "object" as const,
		properties: {
			sourceId: {
				type: "string",
				description: "Starting node ID (e.g., 'src/api/handler.ts:createUser')",
			},
			targetId: {
				type: "string",
				description: "Ending node ID (e.g., 'src/db/user.ts:saveUser')",
			},
		},
		required: ["sourceId", "targetId"],
	},
};

/**
 * Execute the find_path tool.
 *
 * @param db - Database connection
 * @param params - Tool parameters
 * @returns Formatted string for LLM consumption
 */
export function executeFindPath(
	db: Database.Database,
	params: FindPathParams,
): string {
	const sourceValidation = validateNodeExists(db, params.sourceId, "sourceId");
	if (!sourceValidation.valid) {
		return sourceValidation.error;
	}

	const targetValidation = validateNodeExists(db, params.targetId, "targetId");
	if (!targetValidation.valid) {
		return targetValidation.error;
	}

	const path = queryPath(db, params.sourceId, params.targetId);
	return formatPath(params.sourceId, params.targetId, path);
}
