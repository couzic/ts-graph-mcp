import type Database from "better-sqlite3";
import type { SearchFilters } from "../../db/Types.js";
import { formatSearchResults } from "./format.js";
import { querySearchNodes } from "./query.js";

/**
 * Input parameters for search tool.
 */
export interface SearchParams {
	pattern: string;
	type?:
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
	offset?: number;
	limit?: number;
}

/**
 * MCP tool definition for search.
 */
export const searchDefinition = {
	name: "search",
	description:
		"Search for symbols by pattern with optional filters. Returns matching nodes with metadata and Read tool parameters.",
	inputSchema: {
		type: "object" as const,
		properties: {
			pattern: {
				type: "string",
				description: "Glob pattern (e.g., 'handle*', 'User*Service')",
			},
			type: {
				type: "string",
				description:
					"Filter by type (Function, Class, Method, Interface, TypeAlias, Variable, Property)",
			},
			module: {
				type: "string",
				description: "Filter by module name",
			},
			package: {
				type: "string",
				description: "Filter by package name",
			},
			exported: {
				type: "boolean",
				description: "Filter by export status",
			},
			offset: {
				type: "number",
				description: "Skip first N results (pagination)",
			},
			limit: {
				type: "number",
				description: "Max results to return (default: 100)",
			},
		},
		required: ["pattern"],
	},
};

/**
 * Execute the search tool.
 *
 * @param db - Database connection
 * @param params - Tool parameters
 * @returns Formatted string for LLM consumption
 */
export function executeSearch(
	db: Database.Database,
	params: SearchParams,
): string {
	const filters: SearchFilters = {};

	if (params.type) {
		filters.type = params.type;
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
	if (params.offset !== undefined) {
		filters.offset = params.offset;
	}
	if (params.limit !== undefined) {
		filters.limit = params.limit;
	}

	const nodes = querySearchNodes(db, params.pattern, filters);
	return formatSearchResults(nodes);
}
