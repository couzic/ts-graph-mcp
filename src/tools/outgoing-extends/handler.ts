import type Database from "better-sqlite3";
import { formatAmbiguous, formatNotFound } from "../shared/errorFormatters.js";
import { resolveSymbol } from "../shared/resolveSymbol.js";
import { formatExtends } from "./format.js";
import { queryExtends } from "./query.js";

/**
 * Input parameters for outgoingExtends tool.
 */
export interface OutgoingExtendsParams {
	symbol: string;
	file?: string;
	module?: string;
	package?: string;
	maxDepth?: number;
}

/**
 * MCP tool definition for outgoingExtends.
 */
export const outgoingExtendsDefinition = {
	name: "outgoingExtends",
	description:
		"Find what a class or interface extends (inheritance chain). Use this to answer 'What does this class inherit from?' or 'What is the superclass?'",
	inputSchema: {
		type: "object" as const,
		properties: {
			symbol: {
				type: "string",
				description: "Symbol name (e.g., 'UserService', 'AdminUser')",
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
			maxDepth: {
				type: "number",
				description:
					"Optional: Maximum traversal depth for transitive inheritance chain (1-100, default: 10)",
			},
		},
		required: ["symbol"],
	},
};

/**
 * Execute the outgoingExtends tool.
 *
 * @param db - Database connection
 * @param params - Tool parameters
 * @returns Formatted string for LLM consumption
 */
export function executeOutgoingExtends(
	db: Database.Database,
	params: OutgoingExtendsParams,
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
	const maxDepth = params.maxDepth ?? 10;
	const nodes = queryExtends(db, nodeId, maxDepth);
	return formatExtends(result.node, nodes);
}
