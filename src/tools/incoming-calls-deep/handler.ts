import { resolve } from "node:path";
import type Database from "better-sqlite3";
import { formatAmbiguous, formatNotFound } from "../shared/errorFormatters.js";
import {
	extractFunctionBody,
	extractSnippets,
} from "../shared/extractSnippet.js";
import { resolveSymbol } from "../shared/resolveSymbol.js";
import { formatCallers, formatCallersWithSnippets } from "./format.js";
import {
	type QueryCallersOptions,
	queryCallers,
	queryCallersWithCallSites,
} from "./query.js";

/**
 * Maximum number of callers before snippets are automatically excluded.
 * When caller count exceeds this, only metadata is returned to prevent context overload.
 */
const SNIPPET_THRESHOLD = 15;

/**
 * Maximum lines for a function to be considered "small".
 * Small functions show their whole body instead of snippets around call sites.
 */
const SMALL_FUNCTION_THRESHOLD = 10;

/**
 * Input parameters for incomingCallsDeep tool.
 */
export interface IncomingCallsDeepParams {
	symbol: string;
	file?: string;
	module?: string;
	package?: string;
	maxDepth?: number;
}

/**
 * MCP tool definition for incomingCallsDeep.
 */
export const incomingCallsDeepDefinition = {
	name: "incomingCallsDeep",
	description:
		"Find all callers of a function or method, including transitive callers (callers of callers). Use this to answer 'Who uses this function?' or 'What code calls this API?' Returns results grouped by file with depth (1=direct, 2+=transitive) and call count. Automatically includes source code snippets when caller count is small.",
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
					"Optional: Maximum traversal depth for transitive callers (1-100)",
			},
		},
		required: ["symbol"],
	},
};

/**
 * Execute the incomingCallsDeep tool.
 *
 * @param db - Database connection
 * @param params - Tool parameters
 * @param projectRoot - Project root for resolving file paths
 * @returns Formatted string for LLM consumption
 */
export function executeIncomingCallsDeep(
	db: Database.Database,
	params: IncomingCallsDeepParams,
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

	const options: QueryCallersOptions = {};
	if (params.maxDepth !== undefined) {
		options.maxDepth = params.maxDepth;
	}

	// Query all transitive callers
	const allCallers = queryCallers(db, nodeId, options);

	// Auto-include snippets when caller count is manageable
	if (allCallers.length <= SNIPPET_THRESHOLD) {
		// Get direct callers with call sites for snippet extraction
		// (only direct CALLS edges have call_sites stored)
		const directCallersWithSites = queryCallersWithCallSites(db, nodeId);

		// Build map of node ID → call sites for direct callers
		const callSitesByNodeId = new Map<string, number[]>();
		for (const { node, callSites } of directCallersWithSites) {
			callSitesByNodeId.set(node.id, callSites);
		}

		// Map ALL transitive callers, extracting snippets appropriately
		const allCallersWithSnippets = allCallers.map((node) => {
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

			// For larger direct callers, show snippets around call sites
			if (callSites && callSites.length > 0) {
				return { node, snippets: extractSnippets(absolutePath, callSites) };
			}

			// Transitive callers of large functions: no snippets
			return { node, snippets: [] };
		});

		return formatCallersWithSnippets(result.node, allCallersWithSnippets);
	}

	// Too many callers - return list without snippets
	return formatCallers(result.node, allCallers, { snippetsOmitted: true });
}
