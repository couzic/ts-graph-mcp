import type Database from "better-sqlite3";
import { formatAmbiguous, formatNotFound } from "../shared/errorFormatters.js";
import { resolveSymbol } from "../shared/resolveSymbol.js";
import { formatNeighbors, type OutputType } from "./format.js";
import { type Direction, queryNeighbors } from "./query.js";

/**
 * Input parameters for getNeighborhood tool.
 */
export interface GetNeighborhoodParams {
	symbol: string;
	file?: string;
	module?: string;
	package?: string;
	distance?: number;
	direction?: Direction;
	outputTypes?: OutputType[];
}

/**
 * MCP tool definition for getNeighborhood.
 */
export const getNeighborhoodDefinition = {
	name: "getNeighborhood",
	description:
		"Find dependencies or dependents of a symbol. Use direction='outgoing' to see what a symbol imports, calls, or uses. Use direction='incoming' to see what imports, calls, or uses this symbol. The distance parameter controls how many levels deep to traverse (1 = direct only, 2+ = transitive).",
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
			distance: {
				type: "number",
				description:
					"How many levels of dependencies to traverse (1 = direct only, 2+ = transitive, default: 1)",
			},
			direction: {
				type: "string",
				description:
					"Direction to traverse: 'outgoing', 'incoming', or 'both' (default: 'both')",
				enum: ["outgoing", "incoming", "both"],
			},
			outputTypes: {
				type: "array",
				description:
					"Output formats to include (default: ['text']). Use ['text', 'mermaid'] for diagram.",
				items: {
					type: "string",
					enum: ["text", "mermaid"],
				},
			},
		},
		required: ["symbol"],
	},
};

/**
 * Execute the getNeighborhood tool.
 *
 * @param db - Database connection
 * @param params - Tool parameters
 * @returns Formatted string for LLM consumption
 */
export function executeGetNeighborhood(
	db: Database.Database,
	params: GetNeighborhoodParams,
): string {
	const result = resolveSymbol(db, params);

	if (result.status === "not_found") {
		return formatNotFound(params.symbol, result.suggestions);
	}

	if (result.status === "ambiguous") {
		return formatAmbiguous(params.symbol, result.candidates);
	}

	const distance = Math.min(Math.max(params.distance ?? 1, 1), 100);
	const direction = params.direction ?? "both";
	const outputTypes = params.outputTypes ?? ["text"];

	const queryResult = queryNeighbors(db, result.node.id, distance, direction);
	return formatNeighbors(
		queryResult,
		result.node,
		distance,
		direction,
		outputTypes,
	);
}
