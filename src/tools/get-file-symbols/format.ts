import type { Node } from "../../db/Types.js";
import { TYPE_ORDER, TYPE_PLURALS } from "../shared/formatConstants.js";
import { formatNode, groupByType } from "../shared/nodeFormatters.js";

/**
 * Format file symbols for LLM consumption.
 *
 * Output format:
 * ```
 * module: ts-graph-mcp
 * package: main
 * filePath: src/db/Types.ts
 * count: 88
 *
 * interfaces[17]:
 *   BaseNode [24-51] exp
 *   FunctionNode [54-59] exp extends:[BaseNode]
 *   ...
 *
 * properties[66]:
 *   BaseNode.id [26]: string
 *   ...
 * ```
 *
 * Derivation rules (for LLM to reconstruct full data):
 * - Full ID = filePath + ":" + symbol (e.g., "src/db/Types.ts:BaseNode")
 * - name = last segment of symbol after "." (e.g., "id" from "BaseNode.id")
 */
export function formatFileSymbols(filePath: string, nodes: Node[]): string {
	if (nodes.length === 0) {
		return `filePath: ${filePath}\ncount: 0\n\n(no symbols found)`;
	}

	// Extract common metadata (all nodes same file)
	const module = nodes[0]?.module ?? "";
	const pkg = nodes[0]?.package ?? "";

	const lines: string[] = [];

	// Header with hoisted metadata
	lines.push(`module: ${module}`);
	lines.push(`package: ${pkg}`);
	lines.push(`filePath: ${filePath}`);
	lines.push(`count: ${nodes.length}`);
	lines.push("");

	// Group by type and format
	const groups = groupByType(nodes);

	// Output in a consistent order (skip File nodes - they're metadata)
	for (const type of TYPE_ORDER) {
		const typeNodes = groups.get(type);
		if (!typeNodes || typeNodes.length === 0) continue;

		const plural = TYPE_PLURALS[type];
		lines.push(`${plural}[${typeNodes.length}]:`);

		for (const node of typeNodes) {
			lines.push(`  ${formatNode(node)}`);
		}

		lines.push("");
	}

	return lines.join("\n").trimEnd();
}
