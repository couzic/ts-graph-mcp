import type Database from "better-sqlite3";
import { formatAmbiguous, formatNotFound } from "../shared/errorFormatters.js";
import { resolveSymbol } from "../shared/resolveSymbol.js";
import { formatTypeDependencies } from "./format.js";
import { queryTypeDependencies } from "./query.js";

/**
 * Input parameters for outgoingUsesType tool.
 */
export interface OutgoingUsesTypeParams {
	symbol: string;
	context?: "parameter" | "return" | "property" | "variable";
	file?: string;
	module?: string;
	package?: string;
}

/**
 * MCP tool definition for outgoingUsesType.
 */
export const outgoingUsesTypeDefinition = {
	name: "outgoingUsesType",
	description:
		"Find what types a function or class references. Use this to answer 'What types does this function depend on?' Returns type dependencies grouped by file with context (parameter, return, property, variable).",
	inputSchema: {
		type: "object" as const,
		properties: {
			symbol: {
				type: "string",
				description:
					"Function, Method, or Class name (e.g., 'createUser', 'User.save')",
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
 * Execute the outgoingUsesType tool.
 *
 * @param db - Database connection
 * @param params - Tool parameters
 * @returns Formatted string for LLM consumption
 */
export function executeOutgoingUsesType(
	db: Database.Database,
	params: OutgoingUsesTypeParams,
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
	const dependencies = queryTypeDependencies(db, nodeId, params.context);
	return formatTypeDependencies(result.node, dependencies);
}
