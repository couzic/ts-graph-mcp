import type { Node, NodeType } from "../../db/Types.js";
import { TYPE_ORDER, TYPE_PLURALS } from "../shared/formatConstants.js";
import { formatNode } from "../shared/nodeFormatters.js";

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
 * targetId: src/types.ts:User
 * count: 42
 *
 * src/db/Types.ts (15 impacted):
 *   interfaces[3]:
 *     BaseNode [24-51] exp
 *     FunctionNode [54-59] exp extends:[BaseNode]
 *   properties[12]:
 *     BaseNode.id [26]: string
 *     ...
 *
 * src/utils.ts (8 impacted):
 *   functions[5]:
 *     formatDate [10-15] exp (date:Date) → string
 *     ...
 *   variables[3]:
 *     API_URL [1] exp const: string
 *     ...
 * ```
 */
export function formatImpactNodes(targetId: string, nodes: Node[]): string {
	if (nodes.length === 0) {
		return `targetId: ${targetId}\ncount: 0\n\n(no impacted code found)`;
	}

	const lines: string[] = [];

	// Header
	lines.push(`targetId: ${targetId}`);
	lines.push(`count: ${nodes.length}`);
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
				lines.push(`    ${formatNode(node)}`);
			}

			lines.push("");
		}
	}

	return lines.join("\n").trimEnd();
}
