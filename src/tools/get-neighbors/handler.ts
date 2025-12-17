import type Database from "better-sqlite3";
import { validateNodeExists } from "../shared/validateNodeExists.js";
import { formatNeighbors } from "./format.js";
import { type Direction, queryNeighbors } from "./query.js";

/**
 * Input parameters for get_neighbors tool.
 */
export interface GetNeighborsParams {
	nodeId: string;
	distance?: number;
	direction?: Direction;
}

/**
 * MCP tool definition for get_neighbors.
 */
export const getNeighborsDefinition = {
	name: "get_neighbors",
	description:
		"Find all nodes within a given distance from a center node. Returns a subgraph containing the neighborhood with a Mermaid diagram.",
	inputSchema: {
		type: "object" as const,
		properties: {
			nodeId: {
				type: "string",
				description:
					"Center node ID (e.g., 'src/services/UserService.ts:UserService')",
			},
			distance: {
				type: "number",
				description:
					"Distance from center node (number of edges, 1-100, default: 1)",
			},
			direction: {
				type: "string",
				description:
					"Direction to traverse: 'outgoing', 'incoming', or 'both' (default: 'both')",
				enum: ["outgoing", "incoming", "both"],
			},
		},
		required: ["nodeId"],
	},
};

/**
 * Execute the get_neighbors tool.
 *
 * @param db - Database connection
 * @param params - Tool parameters
 * @returns Formatted string for LLM consumption
 */
export function executeGetNeighbors(
	db: Database.Database,
	params: GetNeighborsParams,
): string {
	const validation = validateNodeExists(db, params.nodeId);
	if (!validation.valid) {
		return validation.error;
	}

	const distance = Math.min(Math.max(params.distance ?? 1, 1), 100);
	const direction = params.direction ?? "both";

	const result = queryNeighbors(db, params.nodeId, distance, direction);
	return formatNeighbors(result, distance, direction);
}
