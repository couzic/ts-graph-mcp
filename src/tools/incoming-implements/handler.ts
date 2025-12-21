import type Database from "better-sqlite3";
import { formatAmbiguous, formatNotFound } from "../shared/errorFormatters.js";
import { resolveSymbol } from "../shared/resolveSymbol.js";
import { formatImplementers } from "./format.js";
import { queryImplementers } from "./query.js";

/**
 * Input parameters for incomingImplements tool.
 */
export interface IncomingImplementsParams {
	symbol: string;
	file?: string;
	module?: string;
	package?: string;
}

/**
 * MCP tool definition for incomingImplements.
 */
export const incomingImplementsDefinition = {
	name: "incomingImplements",
	description:
		"Find what classes implement an interface. Use this to answer 'What classes implement this interface?' or 'Where is this contract fulfilled?'",
	inputSchema: {
		type: "object" as const,
		properties: {
			symbol: {
				type: "string",
				description: "Interface name",
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
 * Execute the incomingImplements tool.
 *
 * @param db - Database connection
 * @param params - Tool parameters
 * @returns Formatted string for LLM consumption
 */
export function executeIncomingImplements(
	db: Database.Database,
	params: IncomingImplementsParams,
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
	const implementers = queryImplementers(db, nodeId);
	return formatImplementers(result.node, implementers);
}
