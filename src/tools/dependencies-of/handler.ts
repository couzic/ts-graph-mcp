import type Database from "better-sqlite3";
import { dependenciesOf } from "./dependenciesOf.js";

/**
 * Input parameters for dependenciesOf tool.
 */
export interface DependenciesOfParams {
	file_path: string;
	symbol: string;
}

/**
 * MCP tool definition for dependenciesOf.
 */
export const dependenciesOfDefinition = {
	name: "dependenciesOf",
	description:
		"Find all code that a symbol depends on (forward dependencies). Traces the full call chain with code snippets — use this to understand what happens when a function is called, or to trace execution flow. Answers: 'What does this call?', 'What happens when X runs?', 'What does this symbol depend on?' Returns a Graph section showing the dependency chain and a Nodes section with file locations and code snippets. Prefer this over reading multiple files when tracing calls.",
	// "Find all code that a symbol depends on (forward dependencies). Use this to answer 'What does this symbol depend on?' Returns a Graph section showing the dependency chain and a Nodes section with file locations and code snippets.",
	inputSchema: {
		type: "object" as const,
		properties: {
			file_path: {
				type: "string",
				description: "File path containing the symbol (e.g., 'src/utils.ts')",
			},
			symbol: {
				type: "string",
				description: "Symbol name (e.g., 'formatDate', 'User.save')",
			},
		},
		required: ["file_path", "symbol"],
	},
};

/**
 * Execute the dependenciesOf tool.
 *
 * @param db - Database connection
 * @param params - Tool parameters
 * @param projectRoot - Project root for resolving file paths
 * @returns Formatted string for LLM consumption
 */
export function executeDependenciesOf(
	db: Database.Database,
	params: DependenciesOfParams,
	projectRoot: string,
): string {
	return dependenciesOf(db, projectRoot, params.file_path, params.symbol);
}
