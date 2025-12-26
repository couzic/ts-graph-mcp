import type Database from "better-sqlite3";
import { dependentsOf } from "./dependentsOf.js";

/**
 * Input parameters for dependentsOf tool.
 */
export interface DependentsOfParams {
  file_path: string;
  symbol: string;
}

/**
 * MCP tool definition for dependentsOf.
 */
export const dependentsOfDefinition = {
  name: "dependentsOf",
  description:
    // "Find all code that depends on a symbol (reverse dependencies). Use this to answer 'Who depends on this symbol?' or 'What would break if I changed this?' Returns a Graph section showing the dependency chain and a Nodes section with file locations and code snippets.",
    "Find all code that depends on a symbol (reverse dependencies). Shows all callers transitively with code snippets — use this to understand impact before changing code. Answers: 'Who calls this?', 'What would break if I changed this?', 'Who depends on this symbol?' Returns a Graph section showing the dependency chain and a Nodes section with file locations and code snippets. Prefer this over reading multiple files when finding usages.",
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
 * Execute the dependentsOf tool.
 *
 * @param db - Database connection
 * @param params - Tool parameters
 * @param projectRoot - Project root for resolving file paths
 * @returns Formatted string for LLM consumption
 */
export function executeDependentsOf(
  db: Database.Database,
  params: DependentsOfParams,
  projectRoot: string,
): string {
  return dependentsOf(db, projectRoot, params.file_path, params.symbol);
}
