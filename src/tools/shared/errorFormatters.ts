import type { SymbolLocation } from "./resolveSymbol.js";

/**
 * Format a "not found" error with optional suggestions.
 *
 * @param symbol - The symbol that was not found
 * @param suggestions - Optional similar symbol names
 * @param label - Optional label for multi-symbol queries (e.g., "from.symbol")
 */
export function formatNotFound(
	symbol: string,
	suggestions?: string[],
	label?: string,
): string {
	const symbolRef = label ? `${label} "${symbol}"` : `Symbol "${symbol}"`;
	let msg = `${symbolRef} not found`;
	if (suggestions && suggestions.length > 0) {
		msg += `\n\nDid you mean: ${suggestions.join(", ")}?`;
	}
	msg += "\n\nNarrow your query with: file, module, or package parameter";
	return msg;
}

/**
 * Format an "ambiguous" error with all candidate matches.
 *
 * @param symbol - The symbol with multiple matches
 * @param candidates - All matching symbols
 * @param label - Optional label for multi-symbol queries (e.g., "from.symbol")
 */
export function formatAmbiguous(
	symbol: string,
	candidates: SymbolLocation[],
	label?: string,
): string {
	const symbolRef = label ? `${label} "${symbol}"` : `"${symbol}"`;
	const lines = [`Multiple matches for ${symbolRef}:\n`];
	lines.push("candidates:");
	for (const c of candidates) {
		lines.push(`  - ${c.name} (${c.type}) in ${c.file}`);
		lines.push(`    offset: ${c.offset}, limit: ${c.limit}`);
		lines.push(`    module: ${c.module}, package: ${c.package}`);
	}
	lines.push("\nNarrow your query with: file, module, or package parameter");
	return lines.join("\n");
}
