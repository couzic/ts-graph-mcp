import type { Node } from "../../db/Types.js";
import { TYPE_ORDER, TYPE_PLURALS } from "../shared/formatConstants.js";
import {
	formatLocation,
	formatNode,
	groupByFile,
	groupByType,
} from "../shared/nodeFormatters.js";
import type { SymbolLocation } from "../shared/resolveSymbol.js";

/**
 * Format descendants (subclasses/subinterfaces) for LLM consumption with hierarchical grouping.
 *
 * Output format:
 * ```
 * target:
 *   name: BaseService
 *   type: Class
 *   file: src/models.ts
 *   offset: 4
 *   limit: 6
 *   module: core
 *   package: main
 *
 * extended by[2]:
 *
 * src/models.ts (2 descendants):
 *   classes[2]:
 *     UserService [13-19] exp
 *       offset: 13, limit: 7
 *     AdminService [22-28] exp
 *       offset: 22, limit: 7
 * ```
 */
export function formatDescendants(
	target: SymbolLocation,
	nodes: Node[],
): string {
	const lines: string[] = [];

	// Header - machine-readable location for Read tool
	lines.push("target:");
	lines.push(`  name: ${target.name}`);
	lines.push(`  type: ${target.type}`);
	lines.push(`  file: ${target.file}`);
	lines.push(`  offset: ${target.offset}`);
	lines.push(`  limit: ${target.limit}`);
	lines.push(`  module: ${target.module}`);
	lines.push(`  package: ${target.package}`);
	lines.push("");

	if (nodes.length === 0) {
		lines.push("extended by[0]:");
		lines.push("");
		lines.push("(no descendants found)");
		return lines.join("\n");
	}

	lines.push(`extended by[${nodes.length}]:`);
	lines.push("");

	// Group by file
	const fileGroups = groupByFile(nodes);

	// Sort files alphabetically for consistent output
	const sortedFiles = Array.from(fileGroups.keys()).sort();

	for (const filePath of sortedFiles) {
		const fileNodes = fileGroups.get(filePath);
		if (!fileNodes || fileNodes.length === 0) continue;

		// File header
		lines.push(`${filePath} (${fileNodes.length} descendants):`);

		// Group by type within the file
		const typeGroups = groupByType(fileNodes);

		// Output in consistent order (skip File nodes - they're metadata)
		for (const type of TYPE_ORDER) {
			const typeNodes = typeGroups.get(type);
			if (!typeNodes || typeNodes.length === 0) continue;

			const plural = TYPE_PLURALS[type];
			lines.push(`  ${plural}[${typeNodes.length}]:`);

			for (const node of typeNodes) {
				const loc = formatLocation(node);
				lines.push(`    ${formatNode(node)}`);
				lines.push(`      offset: ${loc.offset}, limit: ${loc.limit}`);
			}
		}

		lines.push("");
	}

	return lines.join("\n").trimEnd();
}
