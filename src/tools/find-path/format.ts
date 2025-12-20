import type { Edge } from "../../db/Types.js";
import { extractSymbol } from "../shared/nodeFormatters.js";
import type { SymbolLocation } from "../shared/resolveSymbol.js";
import type { PathResult } from "./query.js";

/**
 * Format a not_found result.
 */
export function formatNotFound(
	symbolLabel: string,
	suggestions?: string[],
): string {
	const lines: string[] = [];
	lines.push(`error: ${symbolLabel} not found`);

	if (suggestions && suggestions.length > 0) {
		lines.push("");
		lines.push("Did you mean:");
		for (const suggestion of suggestions) {
			lines.push(`  - ${suggestion}`);
		}
	}

	return lines.join("\n");
}

/**
 * Format an ambiguous result.
 */
export function formatAmbiguous(
	symbolLabel: string,
	candidates: SymbolLocation[],
): string {
	const lines: string[] = [];
	lines.push(
		`error: ${symbolLabel} is ambiguous (${candidates.length} matches)`,
	);
	lines.push("");
	lines.push("Specify file, module, or package to disambiguate:");

	for (const candidate of candidates) {
		const symbol = extractSymbol(candidate.id);
		lines.push(`  - ${symbol} (${candidate.type})`);
		lines.push(`    file: ${candidate.file}`);
		lines.push(
			`    module: ${candidate.module}, package: ${candidate.package}`,
		);
		lines.push(`    offset: ${candidate.offset}, limit: ${candidate.limit}`);
	}

	return lines.join("\n");
}

/**
 * Format a path result for LLM consumption.
 *
 * Uses a compact linear notation that shows the path as a chain:
 * ```
 * from: formatDate (Function)
 *   file: src/utils.ts
 *   offset: 15, limit: 6
 *
 * to: saveData (Function)
 *   file: src/db.ts
 *   offset: 42, limit: 8
 *
 * found: true
 * length: 2
 *
 * path: formatDate --CALLS--> process --CALLS--> saveData
 * ```
 *
 * @param from - The source symbol location
 * @param to - The target symbol location
 * @param path - The path result, or null if no path found
 * @returns Formatted string for LLM consumption
 */
export function formatPath(
	from: SymbolLocation,
	to: SymbolLocation,
	path: PathResult | null,
): string {
	const lines: string[] = [];

	// From section
	const fromSymbol = extractSymbol(from.id);
	lines.push(`from: ${fromSymbol} (${from.type})`);
	lines.push(`  file: ${from.file}`);
	lines.push(`  offset: ${from.offset}, limit: ${from.limit}`);
	lines.push("");

	// To section
	const toSymbol = extractSymbol(to.id);
	lines.push(`to: ${toSymbol} (${to.type})`);
	lines.push(`  file: ${to.file}`);
	lines.push(`  offset: ${to.offset}, limit: ${to.limit}`);
	lines.push("");

	if (!path) {
		lines.push("found: false");
		lines.push("");
		lines.push("(no path exists between these nodes)");
		return lines.join("\n");
	}

	lines.push("found: true");
	lines.push(`length: ${path.edges.length}`);
	lines.push("");

	// Build the linear path chain (using symbol names, not full IDs)
	const pathChain = buildPathChain(path.nodes, path.edges);
	lines.push(`path: ${pathChain}`);

	return lines.join("\n");
}

/**
 * Build a linear path chain showing nodes connected by edge types.
 *
 * Example: "formatDate --CALLS--> process --CALLS--> saveData"
 */
function buildPathChain(nodes: string[], edges: Edge[]): string {
	if (nodes.length === 0) return "(empty path)";
	if (nodes.length === 1) {
		const node = nodes[0];
		return node ? extractSymbol(node) : "(unknown)";
	}

	const parts: string[] = [];
	for (let i = 0; i < nodes.length; i++) {
		const node = nodes[i];
		if (node === undefined) continue;

		// Extract symbol name from full ID
		parts.push(extractSymbol(node));

		// Add edge arrow if there's a next node
		if (i < edges.length) {
			const edge = edges[i];
			const edgeType = edge?.type ?? "???";
			parts.push(`--${edgeType}-->`);
		}
	}

	return parts.join(" ");
}
