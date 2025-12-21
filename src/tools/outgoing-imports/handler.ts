import type Database from "better-sqlite3";
import { formatAmbiguous, formatNotFound } from "../shared/errorFormatters.js";
import { resolveSymbol } from "../shared/resolveSymbol.js";
import { formatImports } from "./format.js";
import { queryImports } from "./query.js";

/**
 * Input parameters for outgoingImports tool.
 */
export interface OutgoingImportsParams {
	symbol: string;
	file?: string;
	module?: string;
	package?: string;
}

/**
 * MCP tool definition for outgoingImports.
 */
export const outgoingImportsDefinition = {
	name: "outgoingImports",
	description:
		"Find what a file imports. Use this to answer 'What are the dependencies of this file?' or 'What does this module import?' Returns imported files with the symbols imported from each.",
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
		},
		required: ["symbol"],
	},
};

/**
 * Execute the outgoingImports tool.
 *
 * @param db - Database connection
 * @param params - Tool parameters
 * @returns Formatted string for LLM consumption
 */
export function executeOutgoingImports(
	db: Database.Database,
	params: OutgoingImportsParams,
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
	const imports = queryImports(db, nodeId);
	return formatImports(result.node, imports);
}
