import { resolve } from "node:path";
import type Database from "better-sqlite3";
import { formatAmbiguous, formatNotFound } from "../shared/errorFormatters.js";
import {
  extractFunctionBody,
  extractSnippets,
} from "../shared/extractSnippet.js";
import { resolveSymbol } from "../shared/resolveSymbol.js";
import { formatCallees, formatCalleesWithSnippets } from "./format.js";
import { queryCallees, queryCalleesWithCallSites } from "./query.js";

/**
 * Maximum number of callees before snippets are automatically excluded.
 * When callee count exceeds this, only metadata is returned to prevent context overload.
 */
const SNIPPET_THRESHOLD = 15;

/**
 * Maximum lines for a function to be considered "small".
 * Small functions show their whole body instead of snippets around call sites.
 */
const SMALL_FUNCTION_THRESHOLD = 10;

/**
 * Input parameters for outgoingCallsDeep tool.
 */
export interface OutgoingCallsDeepParams {
  symbol: string;
  file?: string;
  module?: string;
  package?: string;
  maxDepth?: number;
}

/**
 * MCP tool definition for outgoingCallsDeep.
 */
export const outgoingCallsDeepDefinition = {
  name: "outgoingCallsDeep",
  description:
    "Find all functions or methods called by a symbol, including transitive callees. Use this to answer 'What does this function depend on?' or 'Trace the call chain from this entry point.' Returns results grouped by file with depth (1=direct, 2+=transitive). Automatically includes source code snippets when callee count is small.",
  inputSchema: {
    type: "object" as const,
    properties: {
      symbol: {
        type: "string",
        description: "Symbol name (e.g., 'formatDate', 'User.save')",
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
          "Optional: Maximum traversal depth for transitive callees (1-100)",
      },
    },
    required: ["symbol"],
  },
};

/**
 * Execute the outgoingCallsDeep tool.
 *
 * @param db - Database connection
 * @param params - Tool parameters
 * @param projectRoot - Project root for resolving file paths
 * @returns Formatted string for LLM consumption
 */
export function executeOutgoingCallsDeep(
  db: Database.Database,
  params: OutgoingCallsDeepParams,
  projectRoot: string,
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
  const maxDepth = params.maxDepth ?? 100;

  // Query all transitive callees
  const allCallees = queryCallees(db, nodeId, maxDepth);

  // Auto-include snippets when callee count is manageable
  if (allCallees.length <= SNIPPET_THRESHOLD) {
    // Get direct callees with call sites for snippet extraction
    // (only direct CALLS edges have call_sites stored)
    const directCalleesWithSites = queryCalleesWithCallSites(db, nodeId);

    // Build map of node ID → call sites for direct callees
    const callSitesByNodeId = new Map<string, number[]>();
    for (const { node, callSites } of directCalleesWithSites) {
      callSitesByNodeId.set(node.id, callSites);
    }

    // Map ALL transitive callees, extracting snippets appropriately
    const allCalleesWithSnippets = allCallees.map((node) => {
      const absolutePath = resolve(projectRoot, node.filePath);
      const functionLines = node.endLine - node.startLine + 1;
      const callSites = callSitesByNodeId.get(node.id);

      // For small functions, show the whole body
      if (functionLines <= SMALL_FUNCTION_THRESHOLD) {
        const body = extractFunctionBody(
          absolutePath,
          node.startLine,
          node.endLine,
        );
        return { node, snippets: body ? [body] : [] };
      }

      // For larger direct callees, show snippets around call sites
      if (callSites && callSites.length > 0) {
        return { node, snippets: extractSnippets(absolutePath, callSites) };
      }

      // Transitive callees of large functions: no snippets
      return { node, snippets: [] };
    });

    return formatCalleesWithSnippets(result.node, allCalleesWithSnippets);
  }

  // Too many callees - return list without snippets
  return formatCallees(result.node, allCallees, { snippetsOmitted: true });
}
