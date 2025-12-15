import type Database from "better-sqlite3";
import type { SearchFilters } from "../../db/Types.js";
import { formatSearchResults } from "./format.js";
import { querySearchNodes } from "./query.js";

/**
 * Input parameters for search_nodes tool.
 */
export interface SearchNodesParams {
	pattern: string;
	nodeType?:
		| "Function"
		| "Class"
		| "Method"
		| "Interface"
		| "TypeAlias"
		| "Variable"
		| "File"
		| "Property";
	module?: string;
	package?: string;
	exported?: boolean;
}

/**
 * MCP tool definition for search_nodes.
 */
export const searchNodesDefinition = {
	name: "search_nodes",
	description:
		"Search for nodes by name pattern. Supports glob patterns (*, ?). Returns matching nodes with their metadata.",
	inputSchema: {
		type: "object" as const,
		properties: {
			pattern: {
				type: "string",
				description: "Search pattern (e.g., 'handle*', 'User*Service')",
			},
			nodeType: {
				type: "string",
				description:
					"Optional: Filter by node type (Function, Class, Method, Interface, TypeAlias, Variable, File, Property)",
			},
			module: {
				type: "string",
				description: "Optional: Filter by module name",
			},
			package: {
				type: "string",
				description: "Optional: Filter by package name",
			},
			exported: {
				type: "boolean",
				description: "Optional: Filter by export status",
			},
		},
		required: ["pattern"],
	},
};

/**
 * Execute the search_nodes tool.
 *
 * @param db - Database connection
 * @param params - Tool parameters
 * @returns Formatted string for LLM consumption
 */
export function executeSearchNodes(
	db: Database.Database,
	params: SearchNodesParams,
): string {
	const filters: SearchFilters = {};

	if (params.nodeType) {
		filters.nodeType = params.nodeType;
	}
	if (params.module) {
		filters.module = params.module;
	}
	if (params.package) {
		filters.package = params.package;
	}
	if (params.exported !== undefined) {
		filters.exported = params.exported;
	}

	const nodes = querySearchNodes(db, params.pattern, filters);
	return formatSearchResults(nodes);
}
