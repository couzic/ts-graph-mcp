import type { Node } from "../../db/Types.js";
import { TYPE_ORDER, TYPE_PLURALS } from "../shared/formatConstants.js";
import {
	formatNode,
	groupByFile,
	groupByType,
} from "../shared/nodeFormatters.js";

/**
 * Format search results for LLM consumption.
 *
 * Output format groups nodes by file, then by type within each file:
 * ```
 * count: 42
 * files: 5
 *
 * file: src/db/Types.ts
 * module: ts-graph-mcp
 * package: main
 * matches: 17
 *
 * interfaces[10]:
 *   BaseNode [24-51] exp
 *   FunctionNode [54-59] exp extends:[BaseNode]
 *   ...
 *
 * properties[7]:
 *   BaseNode.id [26]: string
 *   ...
 *
 * file: src/utils/helpers.ts
 * ...
 * ```
 *
 * Derivation rules (for LLM to reconstruct full data):
 * - Full ID = filePath + ":" + symbol (e.g., "src/db/Types.ts:BaseNode")
 * - name = last segment of symbol after "." (e.g., "id" from "BaseNode.id")
 */
export function formatSearchResults(nodes: Node[]): string {
	if (nodes.length === 0) {
		return "count: 0\n\n(no matches found)";
	}

	const lines: string[] = [];
	const fileGroups = groupByFile(nodes);

	// Overall summary
	lines.push(`count: ${nodes.length}`);
	lines.push(`files: ${fileGroups.size}`);
	lines.push("");

	// Process each file
	for (const [filePath, fileNodes] of fileGroups) {
		// File header with metadata
		lines.push(`file: ${filePath}`);
		const module = fileNodes[0]?.module ?? "";
		const pkg = fileNodes[0]?.package ?? "";
		lines.push(`module: ${module}`);
		lines.push(`package: ${pkg}`);
		lines.push(`matches: ${fileNodes.length}`);
		lines.push("");

		// Group by type within this file
		const typeGroups = groupByType(fileNodes);

		for (const type of TYPE_ORDER) {
			const typeNodes = typeGroups.get(type);
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
