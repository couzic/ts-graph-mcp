import type Database from "better-sqlite3";
import { validateFileExists } from "../shared/validateNodeExists.js";
import { formatFileSymbols } from "./format.js";
import { queryFileNodes } from "./query.js";

/**
 * Input parameters for get_file_symbols tool.
 */
export interface GetFileSymbolsParams {
	filePath: string;
}

/**
 * MCP tool definition for get_file_symbols.
 */
export const getFileSymbolsDefinition = {
	name: "get_file_symbols",
	description:
		"Get all symbols (functions, classes, interfaces, etc.) defined in a file. Returns all nodes in the specified file.",
	inputSchema: {
		type: "object" as const,
		properties: {
			filePath: {
				type: "string",
				description: "Relative file path (e.g., 'src/utils/helpers.ts')",
			},
		},
		required: ["filePath"],
	},
};

/**
 * Execute the get_file_symbols tool.
 *
 * @param db - Database connection
 * @param params - Tool parameters
 * @returns Formatted string for LLM consumption
 */
export function executeGetFileSymbols(
	db: Database.Database,
	params: GetFileSymbolsParams,
): string {
	const validation = validateFileExists(db, params.filePath);
	if (!validation.valid) {
		return validation.error;
	}

	const nodes = queryFileNodes(db, params.filePath);
	return formatFileSymbols(params.filePath, nodes);
}
