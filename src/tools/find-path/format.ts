import type { Edge } from "../../db/Types.js";
import type { PathResult } from "./query.js";

/**
 * Format a path result for LLM consumption.
 *
 * Uses a compact linear notation that shows the path as a chain:
 * ```
 * sourceId: src/api.ts:handleRequest
 * targetId: src/db.ts:saveData
 * found: true
 * length: 2
 *
 * path: src/api.ts:handleRequest --CALLS--> src/service.ts:process --CALLS--> src/db.ts:saveData
 * ```
 *
 * This format eliminates redundancy:
 * - No separate start/end fields (derivable from path endpoints)
 * - No edge source/target (derivable from position in chain)
 * - Single-line path notation for quick scanning
 *
 * @param sourceId - The source node ID that was queried
 * @param targetId - The target node ID that was queried
 * @param path - The path result, or null if no path found
 * @returns Formatted string for LLM consumption
 */
export function formatPath(
	sourceId: string,
	targetId: string,
	path: PathResult | null,
): string {
	const lines: string[] = [];

	lines.push(`sourceId: ${sourceId}`);
	lines.push(`targetId: ${targetId}`);

	if (!path) {
		lines.push("found: false");
		lines.push("");
		lines.push("(no path exists between these nodes)");
		return lines.join("\n");
	}

	lines.push("found: true");
	lines.push(`length: ${path.edges.length}`);
	lines.push("");

	// Build the linear path chain
	const pathChain = buildPathChain(path.nodes, path.edges);
	lines.push(`path: ${pathChain}`);

	return lines.join("\n");
}

/**
 * Build a linear path chain showing nodes connected by edge types.
 *
 * Example: "A --CALLS--> B --IMPORTS--> C"
 */
function buildPathChain(nodes: string[], edges: Edge[]): string {
	if (nodes.length === 0) return "(empty path)";
	if (nodes.length === 1) return nodes[0] ?? "(unknown)";

	const parts: string[] = [];
	for (let i = 0; i < nodes.length; i++) {
		const node = nodes[i];
		if (node === undefined) continue;

		parts.push(node);

		// Add edge arrow if there's a next node
		if (i < edges.length) {
			const edge = edges[i];
			const edgeType = edge?.type ?? "???";
			parts.push(`--${edgeType}-->`);
		}
	}

	return parts.join(" ");
}
