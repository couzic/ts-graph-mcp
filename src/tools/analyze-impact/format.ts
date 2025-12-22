import type { Node, NodeType } from "../../db/Types.js";
import { TYPE_ORDER, TYPE_PLURALS } from "../shared/formatConstants.js";
import {
	formatLocation,
	formatModulePackageLines,
	formatNode,
} from "../shared/nodeFormatters.js";
import type { SymbolLocation } from "../shared/resolveSymbol.js";

/**
 * Group nodes by file, then by type within each file.
 */
function groupByFileAndType(nodes: Node[]): Map<string, Map<NodeType, Node[]>> {
	const fileGroups = new Map<string, Map<NodeType, Node[]>>();

	for (const node of nodes) {
		let typeGroups = fileGroups.get(node.filePath);
		if (!typeGroups) {
			typeGroups = new Map<NodeType, Node[]>();
			fileGroups.set(node.filePath, typeGroups);
		}

		const existing = typeGroups.get(node.type) ?? [];
		existing.push(node);
		typeGroups.set(node.type, existing);
	}

	return fileGroups;
}

/**
 * Format impacted nodes for LLM consumption.
 *
 * Groups nodes hierarchically by file, then by type within file.
 *
 * Output format:
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
 * impacted[42]:
 *
 * src/db/Types.ts (15 impacted):
 *   interfaces[3]:
 *     BaseNode [24-51] exp
 *       offset: 24, limit: 28
 *     FunctionNode [54-59] exp extends:[BaseNode]
 *       offset: 54, limit: 6
 *   properties[12]:
 *     BaseNode.id [26]: string
 *       offset: 26, limit: 1
 *     ...
 *
 * src/utils.ts (8 impacted):
 *   functions[5]:
 *     formatDate [10-15] exp (date:Date) → string
 *       offset: 10, limit: 6
 *     ...
 *   variables[3]:
 *     API_URL [1] exp const: string
 *       offset: 1, limit: 1
 *     ...
 * ```
 */
export function formatImpactNodes(
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
	lines.push(...formatModulePackageLines(target.module, target.package, "  "));
	lines.push("");

	if (nodes.length === 0) {
		lines.push("impacted[0]:");
		lines.push("");
		lines.push("(no impacted code found)");
		return lines.join("\n");
	}

	lines.push(`impacted[${nodes.length}]:`);
	lines.push("");

	// Group by file, then by type
	const fileGroups = groupByFileAndType(nodes);

	// Output each file group
	for (const [filePath, typeGroups] of fileGroups) {
		// Count total nodes in this file
		let fileNodeCount = 0;
		for (const typeNodes of typeGroups.values()) {
			fileNodeCount += typeNodes.length;
		}

		lines.push(`${filePath} (${fileNodeCount} impacted):`);

		// Output types in consistent order
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
