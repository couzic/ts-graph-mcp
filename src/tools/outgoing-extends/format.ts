import { TYPE_ORDER } from "../shared/formatConstants.js";
import {
	formatLocation,
	formatNode,
	groupByDepth,
} from "../shared/nodeFormatters.js";
import type { SymbolLocation } from "../shared/resolveSymbol.js";
import type { NodeWithDepth } from "./query.js";

/**
 * Format inheritance chain for LLM consumption with depth-based grouping.
 *
 * Output format:
 * ```
 * source:
 *   name: AdminService
 *   type: Class
 *   file: src/services/AdminService.ts
 *   offset: 10
 *   limit: 40
 *   module: core
 *   package: main
 *
 * extends[2]:
 *
 * depth 1:
 *   - UserService [src/services/UserService.ts:5-30] exp
 *     offset: 5, limit: 26
 *
 * depth 2:
 *   - BaseService [src/services/BaseService.ts:3-20] exp
 *     offset: 3, limit: 18
 * ```
 */
export function formatExtends(
	source: SymbolLocation,
	nodes: NodeWithDepth[],
): string {
	const lines: string[] = [];

	// Header - machine-readable location for Read tool
	lines.push("source:");
	lines.push(`  name: ${source.name}`);
	lines.push(`  type: ${source.type}`);
	lines.push(`  file: ${source.file}`);
	lines.push(`  offset: ${source.offset}`);
	lines.push(`  limit: ${source.limit}`);
	lines.push(`  module: ${source.module}`);
	lines.push(`  package: ${source.package}`);
	lines.push("");

	if (nodes.length === 0) {
		lines.push("extends[0]:");
		lines.push("");
		lines.push("(no parent classes or interfaces found)");
		return lines.join("\n");
	}

	lines.push(`extends[${nodes.length}]:`);
	lines.push("");

	// Group by depth
	const depthGroups = groupByDepth(nodes);
	const sortedDepths = Array.from(depthGroups.keys()).sort((a, b) => a - b);

	for (const depth of sortedDepths) {
		const depthNodes = depthGroups.get(depth);
		if (!depthNodes || depthNodes.length === 0) continue;

		lines.push(`depth ${depth}:`);

		// Sort by type for consistent output
		const sortedNodes = [...depthNodes].sort((a, b) => {
			const aIndex = TYPE_ORDER.indexOf(a.type);
			const bIndex = TYPE_ORDER.indexOf(b.type);
			return aIndex - bIndex;
		});

		for (const node of sortedNodes) {
			const loc = formatLocation(node);
			lines.push(`  - ${formatNode(node)}`);
			lines.push(`    offset: ${loc.offset}, limit: ${loc.limit}`);
		}

		lines.push("");
	}

	return lines.join("\n").trimEnd();
}
