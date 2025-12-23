import type { Node } from "../../db/Types.js";
import type { Snippet } from "../shared/extractSnippet.js";
import { TYPE_ORDER, TYPE_PLURALS } from "../shared/formatConstants.js";
import {
	formatLocation,
	formatModulePackageLines,
	formatNode,
	groupByFile,
	groupByType,
} from "../shared/nodeFormatters.js";
import type { SymbolLocation } from "../shared/resolveSymbol.js";

/**
 * A caller node with its extracted code snippets.
 */
export interface CallerWithSnippets {
	node: Node;
	snippets: Snippet[];
}

/**
 * Options for formatting callers.
 */
export interface FormatCallersOptions {
	/** When true, indicates snippets were omitted due to high caller count */
	snippetsOmitted?: boolean;
}

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
export function formatCallers(
	target: SymbolLocation,
	nodes: Node[],
	options: FormatCallersOptions = {},
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
		lines.push("callers[0]:");
		lines.push("");
		lines.push("(no callers found)");
		return lines.join("\n");
	}

	lines.push(`callers[${nodes.length}]:`);
	if (options.snippetsOmitted) {
		lines.push("(snippets omitted due to high caller count)");
	}
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

/**
 * Format callers with code snippets showing call sites.
 *
 * Output format:
 * ```
 * target:
 *   name: formatDate
 *   ...
 *
 * callers[2]:
 *
 * src/api/handler.ts (1 caller):
 *   functions[1]:
 *     handleRequest [10-25] async (req:Request) → Response
 *       offset: 10, limit: 16
 *       call at line 18:
 *         const date = formatDate(req.timestamp);
 *         if (date) {
 *           response.headers.set("X-Date", date);
 * ```
 */
export function formatCallersWithSnippets(
	target: SymbolLocation,
	callers: CallerWithSnippets[],
): string {
	const lines: string[] = [];

	// Header - same as formatCallers
	lines.push("target:");
	lines.push(`  name: ${target.name}`);
	lines.push(`  type: ${target.type}`);
	lines.push(`  file: ${target.file}`);
	lines.push(`  offset: ${target.offset}`);
	lines.push(`  limit: ${target.limit}`);
	lines.push(...formatModulePackageLines(target.module, target.package, "  "));
	lines.push("");

	if (callers.length === 0) {
		lines.push("callers[0]:");
		lines.push("");
		lines.push("(no callers found)");
		return lines.join("\n");
	}

	lines.push(`callers[${callers.length}]:`);
	lines.push("");

	// Group by file
	const callersByFile = new Map<string, CallerWithSnippets[]>();
	for (const caller of callers) {
		const file = caller.node.filePath;
		const existing = callersByFile.get(file) ?? [];
		existing.push(caller);
		callersByFile.set(file, existing);
	}

	// Sort files alphabetically
	const sortedFiles = Array.from(callersByFile.keys()).sort();

	for (const filePath of sortedFiles) {
		const fileCallers = callersByFile.get(filePath);
		if (!fileCallers || fileCallers.length === 0) continue;

		lines.push(`${filePath} (${fileCallers.length} callers):`);

		// Group by type within file
		const nodesByType = new Map<string, CallerWithSnippets[]>();
		for (const caller of fileCallers) {
			const type = caller.node.type;
			const existing = nodesByType.get(type) ?? [];
			existing.push(caller);
			nodesByType.set(type, existing);
		}

		for (const type of TYPE_ORDER) {
			const typeCallers = nodesByType.get(type);
			if (!typeCallers || typeCallers.length === 0) continue;

			const plural = TYPE_PLURALS[type];
			lines.push(`  ${plural}[${typeCallers.length}]:`);

			for (const caller of typeCallers) {
				const loc = formatLocation(caller.node);
				lines.push(`    ${formatNode(caller.node)}`);
				lines.push(`      offset: ${loc.offset}, limit: ${loc.limit}`);

				// Add snippets
				for (const snippet of caller.snippets) {
					// callSiteLine undefined = whole function body
					if (snippet.callSiteLine === undefined) {
						lines.push("      function body:");
					} else {
						lines.push(`      call at line ${snippet.callSiteLine}:`);
					}
					// Indent each line of code
					const codeLines = snippet.code.split("\n");
					for (const codeLine of codeLines) {
						lines.push(`        ${codeLine}`);
					}
				}
			}
		}

		lines.push("");
	}

	return lines.join("\n").trimEnd();
}
