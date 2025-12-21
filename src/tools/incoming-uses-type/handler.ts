import type Database from "better-sqlite3";
import { formatAmbiguous, formatNotFound } from "../shared/errorFormatters.js";
import { resolveSymbol } from "../shared/resolveSymbol.js";
import { formatTypeUsages } from "./format.js";
import { queryTypeUsages } from "./query.js";

/**
 * Input parameters for incomingUsesType tool.
 */
export interface IncomingUsesTypeParams {
	symbol: string;
	context?: "parameter" | "return" | "property" | "variable";
	file?: string;
	module?: string;
	package?: string;
}

/**
 * MCP tool definition for incomingUsesType.
 */
export const incomingUsesTypeDefinition = {
	name: "incomingUsesType",
	description:
		"Find what code uses a type in signatures or declarations. Use this to answer 'What functions take this type as a parameter?' or 'Where is this interface referenced?' Returns usages grouped by file with context (parameter, return, property, variable).",
	inputSchema: {
		type: "object" as const,
		properties: {
			symbol: {
				type: "string",
				description:
					"Type, Interface, or TypeAlias name (e.g., 'User', 'Config')",
			},
			context: {
				type: "string",
				enum: ["parameter", "return", "property", "variable"],
				description:
					"Optional filter for usage context (parameter, return, property, variable)",
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
 * Execute the incomingUsesType tool.
 *
 * @param db - Database connection
 * @param params - Tool parameters
 * @returns Formatted string for LLM consumption
 */
export function executeIncomingUsesType(
	db: Database.Database,
	params: IncomingUsesTypeParams,
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
	const usages = queryTypeUsages(db, nodeId, params.context);
	return formatTypeUsages(result.node, usages);
}
