import type Database from "better-sqlite3";
import { formatAmbiguous, formatNotFound } from "../shared/errorFormatters.js";
import { resolveSymbol } from "../shared/resolveSymbol.js";
import { formatDescendants } from "./format.js";
import { type QueryDescendantsOptions, queryDescendants } from "./query.js";

/**
 * Input parameters for incomingExtends tool.
 */
export interface IncomingExtendsParams {
	symbol: string;
	file?: string;
	module?: string;
	package?: string;
	maxDepth?: number;
}

/**
 * MCP tool definition for incomingExtends.
 */
export const incomingExtendsDefinition = {
	name: "incomingExtends",
	description:
		"Find what classes extend a base class or interface. Use this to answer 'What subclasses does this have?' or 'What extends this?'",
	inputSchema: {
		type: "object" as const,
		properties: {
			symbol: {
				type: "string",
				description: "Symbol name (e.g., 'BaseService', 'Entity')",
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
					"Optional: Maximum traversal depth for transitive descendants (1-100, default: 10)",
			},
		},
		required: ["symbol"],
	},
};

/**
 * Execute the incomingExtends tool.
 *
 * @param db - Database connection
 * @param params - Tool parameters
 * @returns Formatted string for LLM consumption
 */
export function executeIncomingExtends(
	db: Database.Database,
	params: IncomingExtendsParams,
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
	const options: QueryDescendantsOptions = {};
	if (params.maxDepth !== undefined) {
		options.maxDepth = params.maxDepth;
	}

	const nodes = queryDescendants(db, nodeId, options);
	return formatDescendants(result.node, nodes);
}
