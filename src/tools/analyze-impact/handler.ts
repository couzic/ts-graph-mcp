import { resolve } from "node:path";
import type Database from "better-sqlite3";
import { formatAmbiguous, formatNotFound } from "../shared/errorFormatters.js";
import {
	extractFunctionBody,
	extractSnippets,
} from "../shared/extractSnippet.js";
import { resolveSymbol } from "../shared/resolveSymbol.js";
import { formatImpactNodes, formatImpactNodesWithSnippets } from "./format.js";
import {
	queryImpactedNodes,
	queryImpactedNodesWithCallSites,
} from "./query.js";

/**
 * Maximum number of impacted nodes before snippets are automatically excluded.
 * When impact count exceeds this, only metadata is returned to prevent context overload.
 */
const SNIPPET_THRESHOLD = 15;

/**
 * Maximum lines for a function to be considered "small".
 * Small functions show their whole body instead of snippets around call sites.
 */
const SMALL_FUNCTION_THRESHOLD = 10;

/**
 * Input parameters for analyzeImpact tool.
 */
export interface AnalyzeImpactParams {
	symbol: string;
	file?: string;
	module?: string;
	package?: string;
	maxDepth?: number;
}

/**
 * MCP tool definition for analyzeImpact.
 */
export const analyzeImpactDefinition = {
	name: "analyzeImpact",
	description:
		"Find all code that would be affected if you change a symbol. Includes callers, importers, type users, extenders, and implementers - everything that depends on this symbol. Use this before refactoring to understand the blast radius. Returns summary statistics (total, direct vs transitive, by relationship type, by module) followed by impacted nodes grouped by relationship type → depth tier (direct/transitive) → file.",
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
					"Optional: Maximum traversal depth for transitive dependencies (1-100)",
			},
		},
		required: ["symbol"],
	},
};

/**
 * Execute the analyzeImpact tool.
 *
 * @param db - Database connection
 * @param params - Tool parameters
 * @param projectRoot - Project root for resolving file paths
 * @returns Formatted string for LLM consumption
 */
export function executeAnalyzeImpact(
	db: Database.Database,
	params: AnalyzeImpactParams,
	projectRoot: string,
): string {
	const result = resolveSymbol(db, params);

	if (result.status === "not_found") {
		return formatNotFound(params.symbol, result.suggestions);
	}

	if (result.status === "ambiguous") {
		return formatAmbiguous(params.symbol, result.candidates);
	}

	const nodeId = result.node.id;
	const options = { maxDepth: params.maxDepth };

	// Query all impacted nodes first to check count
	const allImpacted = queryImpactedNodes(db, nodeId, options);

	// Auto-include snippets when impact count is manageable
	if (allImpacted.length <= SNIPPET_THRESHOLD) {
		// Get impacted nodes with call sites for snippet extraction
		const impactedWithCallSites = queryImpactedNodesWithCallSites(
			db,
			nodeId,
			options,
		);

		// Map impacted nodes to include snippets
		const impactedWithSnippets = impactedWithCallSites.map(
			({ node, callSites }) => {
				const absolutePath = resolve(projectRoot, node.filePath);
				const functionLines = node.endLine - node.startLine + 1;

				// Only extract snippets for CALLS edges (which have call sites)
				if (node.entryEdgeType === "CALLS") {
					// For small functions, show the whole body
					if (functionLines <= SMALL_FUNCTION_THRESHOLD) {
						const body = extractFunctionBody(
							absolutePath,
							node.startLine,
							node.endLine,
						);
						return { node, snippets: body ? [body] : [] };
					}

					// For larger functions with call sites, show snippets around call sites
					if (callSites.length > 0) {
						return {
							node,
							snippets: extractSnippets(absolutePath, callSites),
						};
					}
				}

				// Other edge types or CALLS edges without call sites: no snippets
				return { node, snippets: [] };
			},
		);

		return formatImpactNodesWithSnippets(result.node, impactedWithSnippets);
	}

	// Too many impacted nodes - return list without snippets
	return formatImpactNodes(result.node, allImpacted, { snippetsOmitted: true });
}
