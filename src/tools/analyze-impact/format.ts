import type { EdgeType, NodeType } from "../../db/Types.js";
import type { Snippet } from "../shared/extractSnippet.js";
import { TYPE_ORDER, TYPE_PLURALS } from "../shared/formatConstants.js";
import {
	formatLocation,
	formatModulePackageLines,
	formatNode,
} from "../shared/nodeFormatters.js";
import type { SymbolLocation } from "../shared/resolveSymbol.js";
import type { ImpactedNode } from "./query.js";

/**
 * Edge type labels for output.
 * These are user-friendly names that describe the relationship.
 */
const EDGE_TYPE_LABELS: Record<EdgeType, string> = {
	CALLS: "callers",
	IMPORTS: "importers",
	USES_TYPE: "type_users",
	EXTENDS: "extenders",
	IMPLEMENTS: "implementers",
	CONTAINS: "containers",
};

/**
 * Order for edge types in output (most relevant first).
 */
const EDGE_TYPE_ORDER: EdgeType[] = [
	"CALLS",
	"USES_TYPE",
	"IMPORTS",
	"EXTENDS",
	"IMPLEMENTS",
	"CONTAINS",
];

/**
 * Depth tier classification.
 */
type DepthTier = "direct" | "transitive";

/**
 * An impacted node with its extracted code snippets.
 */
export interface ImpactedNodeWithSnippets {
	node: ImpactedNode;
	snippets: Snippet[];
}

/**
 * Options for formatting impacted nodes.
 */
export interface FormatImpactNodesOptions {
	/** When true, indicates snippets were omitted due to high impact count */
	snippetsOmitted?: boolean;
}

/**
 * Classify depth into tiers.
 * - direct: depth 1 (immediate dependents)
 * - transitive: depth 2+ (indirect dependents)
 */
function getDepthTier(depth: number): DepthTier {
	return depth === 1 ? "direct" : "transitive";
}

/**
 * Group nodes by file, then by type within each file.
 */
function groupByFileAndType(
	nodes: ImpactedNode[],
): Map<string, Map<NodeType, ImpactedNode[]>> {
	const fileGroups = new Map<string, Map<NodeType, ImpactedNode[]>>();

	for (const node of nodes) {
		let typeGroups = fileGroups.get(node.filePath);
		if (!typeGroups) {
			typeGroups = new Map<NodeType, ImpactedNode[]>();
			fileGroups.set(node.filePath, typeGroups);
		}

		const existing = typeGroups.get(node.type) ?? [];
		existing.push(node);
		typeGroups.set(node.type, existing);
	}

	return fileGroups;
}

/**
 * Generate summary statistics for the impact analysis.
 */
function generateSummary(nodes: ImpactedNode[]): {
	total: number;
	fileCount: number;
	directCount: number;
	transitiveCount: number;
	maxDepth: number;
	byRelationship: Map<EdgeType, { total: number; direct: number }>;
	byModule: Map<string, number>;
} {
	const files = new Set<string>();
	const byRelationship = new Map<EdgeType, { total: number; direct: number }>();
	const byModule = new Map<string, number>();

	let directCount = 0;
	let transitiveCount = 0;
	let maxDepth = 0;

	for (const node of nodes) {
		files.add(node.filePath);

		// Count by depth tier
		if (node.depth === 1) {
			directCount++;
		} else {
			transitiveCount++;
		}

		// Track max depth
		if (node.depth > maxDepth) {
			maxDepth = node.depth;
		}

		// Count by relationship type
		const rel = byRelationship.get(node.entryEdgeType) ?? {
			total: 0,
			direct: 0,
		};
		rel.total++;
		if (node.depth === 1) {
			rel.direct++;
		}
		byRelationship.set(node.entryEdgeType, rel);

		// Count by module
		const moduleCount = byModule.get(node.module) ?? 0;
		byModule.set(node.module, moduleCount + 1);
	}

	return {
		total: nodes.length,
		fileCount: files.size,
		directCount,
		transitiveCount,
		maxDepth,
		byRelationship,
		byModule,
	};
}

/**
 * Format the summary section.
 */
function formatSummarySection(
	summary: ReturnType<typeof generateSummary>,
): string[] {
	const lines: string[] = [];

	lines.push("summary:");
	lines.push(
		`  total: ${summary.total} impacted across ${summary.fileCount} files`,
	);
	lines.push(`  direct: ${summary.directCount}`);
	lines.push(`  transitive: ${summary.transitiveCount}`);
	lines.push(`  max_depth: ${summary.maxDepth}`);
	lines.push("");
	lines.push("  by_relationship:");

	// Sort by total count descending
	const sortedRels = Array.from(summary.byRelationship.entries()).sort(
		(a, b) => b[1].total - a[1].total,
	);

	for (const [edgeType, counts] of sortedRels) {
		const label = EDGE_TYPE_LABELS[edgeType];
		lines.push(`    ${label}: ${counts.total} (${counts.direct} direct)`);
	}

	// Only show by_module if there are multiple modules
	if (summary.byModule.size > 1) {
		lines.push("");
		lines.push("  by_module:");

		// Sort by count descending
		const sortedModules = Array.from(summary.byModule.entries()).sort(
			(a, b) => b[1] - a[1],
		);

		for (const [moduleName, count] of sortedModules) {
			lines.push(`    ${moduleName}: ${count}`);
		}
	}

	return lines;
}

/**
 * Format nodes within a depth tier, grouped by file → type.
 */
function formatDepthTier(
	tier: DepthTier,
	nodes: ImpactedNode[],
	indent: string,
): string[] {
	const lines: string[] = [];

	lines.push(`${indent}${tier}[${nodes.length}]:`);

	const fileGroups = groupByFileAndType(nodes);

	// Sort files alphabetically
	const sortedFiles = Array.from(fileGroups.keys()).sort();

	for (const filePath of sortedFiles) {
		const typeGroups = fileGroups.get(filePath);
		if (!typeGroups) continue;

		// Count total nodes in this file
		let fileNodeCount = 0;
		for (const typeNodes of typeGroups.values()) {
			fileNodeCount += typeNodes.length;
		}

		lines.push(`${indent}  ${filePath} (${fileNodeCount}):`);

		// Output types in consistent order
		for (const type of TYPE_ORDER) {
			const typeNodes = typeGroups.get(type);
			if (!typeNodes || typeNodes.length === 0) continue;

			const plural = TYPE_PLURALS[type];
			lines.push(`${indent}    ${plural}[${typeNodes.length}]:`);

			for (const node of typeNodes) {
				const loc = formatLocation(node);
				lines.push(`${indent}      ${formatNode(node)}`);
				lines.push(
					`${indent}        offset: ${loc.offset}, limit: ${loc.limit}`,
				);
			}
		}
	}

	return lines;
}

/**
 * Format impacted nodes for LLM consumption.
 *
 * Output is organized hierarchically:
 * 1. Target information (for Read tool compatibility)
 * 2. Summary statistics (quick risk assessment)
 * 3. Nodes grouped by relationship type → depth tier → file → node type
 *
 * Example output:
 * ```
 * target:
 *   name: formatDate
 *   type: Function
 *   file: src/utils.ts
 *   offset: 15
 *   limit: 6
 *   module: core
 *   package: main
 *
 * summary:
 *   total: 42 impacted across 12 files
 *   direct: 5
 *   transitive: 37
 *   max_depth: 5
 *
 *   by_relationship:
 *     callers: 28 (3 direct)
 *     type_users: 8 (1 direct)
 *     importers: 6 (1 direct)
 *
 *   by_module:
 *     core: 18
 *     api: 15
 *     shared: 9
 *
 * callers[28]:
 *   direct[3]:
 *     src/reports.ts (1):
 *       functions[1]:
 *         renderReport [10-25] exp (data:Report) → string
 *           offset: 10, limit: 16
 *   transitive[25]:
 *     src/api/handler.ts (2):
 *       functions[2]:
 *         handleRequest [10-25] exp async
 *           offset: 10, limit: 16
 *
 * type_users[8]:
 *   direct[1]:
 *     ...
 * ```
 */
export function formatImpactNodes(
	target: SymbolLocation,
	nodes: ImpactedNode[],
	options: FormatImpactNodesOptions = {},
): string {
	const lines: string[] = [];

	// Header - machine-readable location for Read tool
	lines.push("target:");
	lines.push(`  name: ${target.name}`);
	lines.push(`  type: ${target.type}`);
	lines.push(`  file: ${target.file}`);
	lines.push(`  offset: ${target.offset}`);
	lines.push(`  limit: ${target.limit}`);
	lines.push(...formatModulePackageLines(target.module, target.package, "  "));
	lines.push("");

	if (nodes.length === 0) {
		lines.push("summary:");
		lines.push("  total: 0 impacted across 0 files");
		lines.push("");
		lines.push("(no impacted code found)");
		return lines.join("\n");
	}

	// Summary statistics
	const summary = generateSummary(nodes);
	lines.push(...formatSummarySection(summary));
	if (options.snippetsOmitted) {
		lines.push("(snippets omitted due to high impact count)");
	}
	lines.push("");

	// Group nodes by edge type, then by depth tier
	const byEdgeType = new Map<EdgeType, Map<DepthTier, ImpactedNode[]>>();

	for (const node of nodes) {
		let tierMap = byEdgeType.get(node.entryEdgeType);
		if (!tierMap) {
			tierMap = new Map<DepthTier, ImpactedNode[]>();
			byEdgeType.set(node.entryEdgeType, tierMap);
		}

		const tier = getDepthTier(node.depth);
		const tierNodes = tierMap.get(tier) ?? [];
		tierNodes.push(node);
		tierMap.set(tier, tierNodes);
	}

	// Output each edge type section in consistent order
	for (const edgeType of EDGE_TYPE_ORDER) {
		const tierMap = byEdgeType.get(edgeType);
		if (!tierMap) continue;

		// Count total for this edge type
		let totalForType = 0;
		for (const tierNodes of tierMap.values()) {
			totalForType += tierNodes.length;
		}

		const label = EDGE_TYPE_LABELS[edgeType];
		lines.push(`${label}[${totalForType}]:`);

		// Output depth tiers: direct first, then transitive
		const directNodes = tierMap.get("direct");
		if (directNodes && directNodes.length > 0) {
			lines.push(...formatDepthTier("direct", directNodes, "  "));
		}

		const transitiveNodes = tierMap.get("transitive");
		if (transitiveNodes && transitiveNodes.length > 0) {
			lines.push(...formatDepthTier("transitive", transitiveNodes, "  "));
		}

		lines.push("");
	}

	return lines.join("\n").trimEnd();
}

/**
 * Format impacted nodes with code snippets showing call sites.
 *
 * Similar to formatImpactNodes but includes code snippets for CALLS edges.
 * Snippets are shown after each node's metadata.
 *
 * Output format:
 * ```
 * target:
 *   name: formatDate
 *   ...
 *
 * summary:
 *   total: 5 impacted across 3 files
 *   ...
 *
 * callers[3]:
 *   direct[2]:
 *     src/api/handler.ts (1):
 *       functions[1]:
 *         handleRequest [10-25] async (req:Request) → Response
 *           offset: 10, limit: 16
 *           call at line 18:
 *             const date = formatDate(req.timestamp);
 *             if (date) {
 *               response.headers.set("X-Date", date);
 *
 * type_users[2]:
 *   direct[1]:
 *     src/models/User.ts (1):
 *       functions[1]:
 *         createUser [5-15] (data:UserInput) → User
 *           offset: 5, limit: 11
 *           (no snippets for USES_TYPE edges)
 * ```
 */
export function formatImpactNodesWithSnippets(
	target: SymbolLocation,
	impacted: ImpactedNodeWithSnippets[],
): string {
	const lines: string[] = [];

	// Header - same as formatImpactNodes
	lines.push("target:");
	lines.push(`  name: ${target.name}`);
	lines.push(`  type: ${target.type}`);
	lines.push(`  file: ${target.file}`);
	lines.push(`  offset: ${target.offset}`);
	lines.push(`  limit: ${target.limit}`);
	lines.push(...formatModulePackageLines(target.module, target.package, "  "));
	lines.push("");

	if (impacted.length === 0) {
		lines.push("summary:");
		lines.push("  total: 0 impacted across 0 files");
		lines.push("");
		lines.push("(no impacted code found)");
		return lines.join("\n");
	}

	// Summary statistics
	const nodes = impacted.map((i) => i.node);
	const summary = generateSummary(nodes);
	lines.push(...formatSummarySection(summary));
	lines.push("");

	// Group nodes by edge type, then by depth tier
	const byEdgeType = new Map<
		EdgeType,
		Map<DepthTier, ImpactedNodeWithSnippets[]>
	>();

	for (const item of impacted) {
		let tierMap = byEdgeType.get(item.node.entryEdgeType);
		if (!tierMap) {
			tierMap = new Map<DepthTier, ImpactedNodeWithSnippets[]>();
			byEdgeType.set(item.node.entryEdgeType, tierMap);
		}

		const tier = getDepthTier(item.node.depth);
		const tierNodes = tierMap.get(tier) ?? [];
		tierNodes.push(item);
		tierMap.set(tier, tierNodes);
	}

	// Output each edge type section in consistent order
	for (const edgeType of EDGE_TYPE_ORDER) {
		const tierMap = byEdgeType.get(edgeType);
		if (!tierMap) continue;

		// Count total for this edge type
		let totalForType = 0;
		for (const tierNodes of tierMap.values()) {
			totalForType += tierNodes.length;
		}

		const label = EDGE_TYPE_LABELS[edgeType];
		lines.push(`${label}[${totalForType}]:`);

		// Output depth tiers: direct first, then transitive
		const directNodes = tierMap.get("direct");
		if (directNodes && directNodes.length > 0) {
			lines.push(...formatDepthTierWithSnippets("direct", directNodes, "  "));
		}

		const transitiveNodes = tierMap.get("transitive");
		if (transitiveNodes && transitiveNodes.length > 0) {
			lines.push(
				...formatDepthTierWithSnippets("transitive", transitiveNodes, "  "),
			);
		}

		lines.push("");
	}

	return lines.join("\n").trimEnd();
}

/**
 * Format nodes within a depth tier with snippets, grouped by file → type.
 */
function formatDepthTierWithSnippets(
	tier: DepthTier,
	items: ImpactedNodeWithSnippets[],
	indent: string,
): string[] {
	const lines: string[] = [];

	lines.push(`${indent}${tier}[${items.length}]:`);

	// Group by file, then by type
	const fileGroups = new Map<
		string,
		Map<NodeType, ImpactedNodeWithSnippets[]>
	>();

	for (const item of items) {
		let typeGroups = fileGroups.get(item.node.filePath);
		if (!typeGroups) {
			typeGroups = new Map<NodeType, ImpactedNodeWithSnippets[]>();
			fileGroups.set(item.node.filePath, typeGroups);
		}

		const existing = typeGroups.get(item.node.type) ?? [];
		existing.push(item);
		typeGroups.set(item.node.type, existing);
	}

	// Sort files alphabetically
	const sortedFiles = Array.from(fileGroups.keys()).sort();

	for (const filePath of sortedFiles) {
		const typeGroups = fileGroups.get(filePath);
		if (!typeGroups) continue;

		// Count total nodes in this file
		let fileNodeCount = 0;
		for (const typeItems of typeGroups.values()) {
			fileNodeCount += typeItems.length;
		}

		lines.push(`${indent}  ${filePath} (${fileNodeCount}):`);

		// Output types in consistent order
		for (const type of TYPE_ORDER) {
			const typeItems = typeGroups.get(type);
			if (!typeItems || typeItems.length === 0) continue;

			const plural = TYPE_PLURALS[type];
			lines.push(`${indent}    ${plural}[${typeItems.length}]:`);

			for (const item of typeItems) {
				const loc = formatLocation(item.node);
				lines.push(`${indent}      ${formatNode(item.node)}`);
				lines.push(
					`${indent}        offset: ${loc.offset}, limit: ${loc.limit}`,
				);

				// Add snippets if present
				for (const snippet of item.snippets) {
					// callSiteLine undefined = whole function body
					if (snippet.callSiteLine === undefined) {
						lines.push(`${indent}        function body:`);
					} else {
						lines.push(
							`${indent}        call at line ${snippet.callSiteLine}:`,
						);
					}
					// Indent each line of code
					const codeLines = snippet.code.split("\n");
					for (const codeLine of codeLines) {
						lines.push(`${indent}          ${codeLine}`);
					}
				}
			}
		}
	}

	return lines;
}
