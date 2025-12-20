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
 * Format callers for LLM consumption with hierarchical grouping.
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
 * callers[12]:
 *
 * src/api/handler.ts (3 callers):
 *   functions[2]:
 *     handleRequest [10-25] exp async (req:Request) → Promise<Response>
 *       offset: 10, limit: 16
 *     validateInput [30-35] (data:unknown) → boolean
 *       offset: 30, limit: 6
 *   methods[1]:
 *     ApiClient.fetch [40-50] private async (url:string) → Promise<Data>
 *       offset: 40, limit: 11
 *
 * src/services/UserService.ts (2 callers):
 *   ...
 * ```
 */
export function formatCallers(target: SymbolLocation, nodes: Node[]): string {
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
		lines.push("callers[0]:");
		lines.push("");
		lines.push("(no callers found)");
		return lines.join("\n");
	}

	lines.push(`callers[${nodes.length}]:`);
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
				const loc = formatLocation(node);
				lines.push(`    ${formatNode(node)}`);
				lines.push(`      offset: ${loc.offset}, limit: ${loc.limit}`);
			}
		}

		lines.push("");
	}

	return lines.join("\n").trimEnd();
}
