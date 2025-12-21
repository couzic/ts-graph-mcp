import type Database from "better-sqlite3";
import { formatAmbiguous, formatNotFound } from "../shared/errorFormatters.js";
import { resolveSymbol } from "../shared/resolveSymbol.js";
import { formatImporters } from "./format.js";
import { queryImporters } from "./query.js";

/**
 * Input parameters for incomingImports tool.
 */
export interface IncomingImportsParams {
	symbol: string;
	file?: string;
	module?: string;
	package?: string;
}

/**
 * MCP tool definition for incomingImports.
 */
export const incomingImportsDefinition = {
	name: "incomingImports",
	description:
		"Find what files import a module. Use this to answer 'What code imports this module?' or 'Where is this file imported?'",
	inputSchema: {
		type: "object" as const,
		properties: {
			symbol: {
				type: "string",
				description: "File or module name",
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
 * Execute the incomingImports tool.
 *
 * @param db - Database connection
 * @param params - Tool parameters
 * @returns Formatted string for LLM consumption
 */
export function executeIncomingImports(
	db: Database.Database,
	params: IncomingImportsParams,
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
	const importers = queryImporters(db, nodeId);
	return formatImporters(result.node, importers);
}
