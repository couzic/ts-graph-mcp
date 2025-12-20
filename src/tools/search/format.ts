import type { Node } from "../../db/Types.js";
import { TYPE_ORDER, TYPE_PLURALS } from "../shared/formatConstants.js";
import {
	formatLocation,
	formatNode,
	groupByFile,
	groupByType,
} from "../shared/nodeFormatters.js";

/**
 * Format search results for LLM consumption.
 *
 * Output format groups nodes by file, then by type within each file.
 * Each node includes offset/limit for direct use with Read tool.
 *
 * Example:
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
 *     offset: 24, limit: 28
 *   FunctionNode [54-59] exp extends:[BaseNode]
 *     offset: 54, limit: 6
 *   ...
 *
 * properties[7]:
 *   BaseNode.id [26]: string
 *     offset: 26, limit: 1
 *   ...
 * ```
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
				// Add Read tool parameters
				const location = formatLocation(node);
				lines.push(`    offset: ${location.offset}, limit: ${location.limit}`);
			}

			lines.push("");
		}
	}

	return lines.join("\n").trimEnd();
}
