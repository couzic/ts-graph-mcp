import type Database from "better-sqlite3";
import { formatAmbiguous, formatNotFound } from "../shared/errorFormatters.js";
import { resolveSymbol } from "../shared/resolveSymbol.js";
import { formatInterfaces } from "./format.js";
import { queryInterfaces } from "./query.js";

/**
 * Input parameters for outgoingImplements tool.
 */
export interface OutgoingImplementsParams {
	symbol: string;
	file?: string;
	module?: string;
	package?: string;
}

/**
 * MCP tool definition for outgoingImplements.
 */
export const outgoingImplementsDefinition = {
	name: "outgoingImplements",
	description:
		"Find what interfaces a class implements. Use this to answer 'What interfaces does this class implement?'",
	inputSchema: {
		type: "object" as const,
		properties: {
			symbol: {
				type: "string",
				description: "Class name",
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
		},
		required: ["symbol"],
	},
};

/**
 * Execute the outgoingImplements tool.
 *
 * @param db - Database connection
 * @param params - Tool parameters
 * @returns Formatted string for LLM consumption
 */
export function executeOutgoingImplements(
	db: Database.Database,
	params: OutgoingImplementsParams,
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
	const interfaces = queryInterfaces(db, nodeId);
	return formatInterfaces(result.node, interfaces);
}
