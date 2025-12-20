import type { Node, NodeType } from "../../db/Types.js";
import { TYPE_ORDER, TYPE_PLURALS } from "../shared/formatConstants.js";
import { formatNode } from "../shared/nodeFormatters.js";

/**
 * Group nodes by file path, then by type within each file.
 */
interface FileGroup {
	filePath: string;
	module: string;
	package: string;
	nodesByType: Map<NodeType, Node[]>;
}

function groupByFileAndType(nodes: Node[]): FileGroup[] {
	const fileMap = new Map<string, FileGroup>();

	for (const node of nodes) {
		let group = fileMap.get(node.filePath);
		if (!group) {
			group = {
				filePath: node.filePath,
				module: node.module,
				package: node.package,
				nodesByType: new Map(),
			};
			fileMap.set(node.filePath, group);
		}

		const existing = group.nodesByType.get(node.type) ?? [];
		existing.push(node);
		group.nodesByType.set(node.type, existing);
	}

	return Array.from(fileMap.values()).sort((a, b) =>
		a.filePath.localeCompare(b.filePath),
	);
}

/**
 * Format callees for LLM consumption using hierarchical file grouping.
 *
 * Output format:
 * ```
 * sourceId: src/api/handler.ts:createUser
 * count: 5
 *
 * === src/db/user.ts (module: core, package: main) ===
 *
 * functions[2]:
 *   saveUser [10-15] exp (user:User) → Promise<void>
 *   validateUser [20-25] (user:User) → boolean
 *
 * === src/utils/logger.ts (module: core, package: main) ===
 *
 * functions[1]:
 *   logInfo [5-7] exp (msg:string) → void
 * ```
 */
export function formatCallees(sourceId: string, nodes: Node[]): string {
	if (nodes.length === 0) {
		return `sourceId: ${sourceId}\ncount: 0\n\n(no callees found)`;
	}

	const lines: string[] = [];

	// Header
	lines.push(`sourceId: ${sourceId}`);
	lines.push(`count: ${nodes.length}`);
	lines.push("");

	// Group by file, then by type
	const fileGroups = groupByFileAndType(nodes);

	for (const fileGroup of fileGroups) {
		// File header
		lines.push(
			`=== ${fileGroup.filePath} (module: ${fileGroup.module}, package: ${fileGroup.package}) ===`,
		);
		lines.push("");

		// Output types in order
		for (const type of TYPE_ORDER) {
			const typeNodes = fileGroup.nodesByType.get(type);
			if (!typeNodes || typeNodes.length === 0) continue;

			const plural = TYPE_PLURALS[type];
			lines.push(`${plural}[${typeNodes.length}]:`);

			for (const node of typeNodes) {
				lines.push(`  ${formatNode(node)}`);
			}

			lines.push("");
		}
	}

	return lines.join("\n").trimEnd();
}
