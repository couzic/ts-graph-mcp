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
	msg += "\n\nNarrow your query with file, module, or package:";
	msg += `\n  { symbol: "${symbol}", file: "src/..." }`;
	msg += `\n  { symbol: "${symbol}", module: "..." }`;
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

	// Generate example disambiguation syntax using actual candidate values
	const examples = generateDisambiguationExamples(symbol, candidates);
	lines.push("\nNarrow your query with file, module, or package:");
	for (const example of examples) {
		lines.push(`  ${example}`);
	}

	return lines.join("\n");
}

/**
 * Generate 2-3 example disambiguation queries based on candidate data.
 * Prioritizes filters that would actually disambiguate (unique values).
 */
function generateDisambiguationExamples(
	symbol: string,
	candidates: SymbolLocation[],
): string[] {
	const examples: string[] = [];
	const first = candidates[0];
	if (!first) return examples;

	// Collect unique values for each filter type
	const uniqueFiles = new Set(candidates.map((c) => c.file));
	const uniqueModules = new Set(candidates.map((c) => c.module));
	const uniquePackages = new Set(candidates.map((c) => c.package));

	// Prioritize filters that would disambiguate (more unique values = better)
	// Show file example if files differ
	if (uniqueFiles.size > 1) {
		examples.push(`{ symbol: "${symbol}", file: "${first.file}" }`);
	}

	// Show module example if modules differ
	if (uniqueModules.size > 1) {
		examples.push(`{ symbol: "${symbol}", module: "${first.module}" }`);
	}

	// Show package example if packages differ
	if (uniquePackages.size > 1) {
		examples.push(`{ symbol: "${symbol}", package: "${first.package}" }`);
	}

	// If all candidates share file/module/package, show at least one example
	if (examples.length === 0) {
		examples.push(`{ symbol: "${symbol}", file: "${first.file}" }`);
	}

	return examples.slice(0, 3); // Max 3 examples
}
