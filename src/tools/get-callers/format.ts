import type { Node } from "../../db/Types.js";
import { TYPE_ORDER, TYPE_PLURALS } from "../shared/formatConstants.js";
import {
	formatNode,
	groupByFile,
	groupByType,
} from "../shared/nodeFormatters.js";

/**
 * Format callers for LLM consumption with hierarchical grouping.
 *
 * Output format:
 * ```
 * targetId: src/utils.ts:formatDate
 * count: 12
 *
 * src/api/handler.ts (3 callers):
 *   functions[2]:
 *     handleRequest [10-25] exp async (req:Request) → Promise<Response>
 *     validateInput [30-35] (data:unknown) → boolean
 *   methods[1]:
 *     ApiClient.fetch [40-50] private async (url:string) → Promise<Data>
 *
 * src/services/UserService.ts (2 callers):
 *   ...
 * ```
 */
export function formatCallers(targetId: string, nodes: Node[]): string {
	if (nodes.length === 0) {
		return `targetId: ${targetId}\ncount: 0\n\n(no callers found)`;
	}

	const lines: string[] = [];

	// Header
	lines.push(`targetId: ${targetId}`);
	lines.push(`count: ${nodes.length}`);
	lines.push("");

	// Group by file
	const fileGroups = groupByFile(nodes);

	// Sort files alphabetically for consistent output
	const sortedFiles = Array.from(fileGroups.keys()).sort();

	for (const filePath of sortedFiles) {
		const fileNodes = fileGroups.get(filePath);
		if (!fileNodes || fileNodes.length === 0) continue;

		// File header
		lines.push(`${filePath} (${fileNodes.length} callers):`);

		// Group by type within the file
		const typeGroups = groupByType(fileNodes);

		// Output in consistent order (skip File nodes - they're metadata)
		for (const type of TYPE_ORDER) {
			const typeNodes = typeGroups.get(type);
			if (!typeNodes || typeNodes.length === 0) continue;

			const plural = TYPE_PLURALS[type];
			lines.push(`  ${plural}[${typeNodes.length}]:`);

			for (const node of typeNodes) {
				lines.push(`    ${formatNode(node)}`);
			}
		}

		lines.push("");
	}

	return lines.join("\n").trimEnd();
}
