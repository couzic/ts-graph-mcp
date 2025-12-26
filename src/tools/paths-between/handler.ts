import type Database from "better-sqlite3";
import { pathsBetween, type SymbolRef } from "./pathsBetween.js";

/**
 * Input parameters for pathsBetween tool.
 */
export interface PathsBetweenParams {
  from: SymbolRef;
  to: SymbolRef;
}

/**
 * MCP tool definition for pathsBetween.
 */
export const pathsBetweenDefinition = {
  name: "pathsBetween",
  description:
    "Find how two symbols connect through the code graph. Use this to answer 'How does A reach B?' or 'What's the dependency path between these symbols?' Bidirectional: finds the path regardless of which direction you specify. The arrows in the output show the actual direction.",
  inputSchema: {
    type: "object" as const,
    properties: {
      from: {
        type: "object",
        description: "Source symbol",
        properties: {
          file_path: {
            type: "string",
            description: "File path (e.g., 'src/api/handler.ts')",
          },
          symbol: {
            type: "string",
            description: "Symbol name (e.g., 'handleRequest')",
          },
        },
        required: ["file_path", "symbol"],
      },
      to: {
        type: "object",
        description: "Target symbol",
        properties: {
          file_path: {
            type: "string",
            description: "File path (e.g., 'src/db/queries.ts')",
          },
          symbol: {
            type: "string",
            description: "Symbol name (e.g., 'executeQuery')",
          },
        },
        required: ["file_path", "symbol"],
      },
    },
    required: ["from", "to"],
  },
};

/**
 * Execute the pathsBetween tool.
 *
 * @param db - Database connection
 * @param params - Tool parameters
 * @param projectRoot - Project root for resolving file paths
 * @returns Formatted string for LLM consumption
 */
export function executePathsBetween(
  db: Database.Database,
  params: PathsBetweenParams,
  projectRoot: string,
): string {
  return pathsBetween(db, projectRoot, params.from, params.to);
}
