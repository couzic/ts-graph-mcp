import type { SymbolLocation } from "../shared/resolveSymbol.js";
import type { ImportResult } from "./query.js";

/**
 * Format imports for LLM consumption with package-grouped output.
 *
 * Output format:
 * ```
 * file: modules/backend/packages/api/src/userRoutes.ts
 * imports (2 packages):
 *
 * shared/types:
 *   - User (type-only)
 *   - Config (type-only)
 *
 * backend/services:
 *   - createUserService
 *   - getUserSummary
 * ```
 */
export function formatImports(
	source: SymbolLocation,
	imports: ImportResult[],
): string {
	const lines: string[] = [];

	// Header - show the file being analyzed
	lines.push(`file: ${source.file}`);

	if (imports.length === 0) {
		lines.push("imports: none");
		return lines.join("\n");
	}

	// Group by package
	const packageGroups = new Map<string, ImportResult[]>();
	for (const imp of imports) {
		const key = `${imp.node.module}/${imp.node.package}`;
		const existing = packageGroups.get(key) ?? [];
		existing.push(imp);
		packageGroups.set(key, existing);
	}

	// Count unique packages
	const packageCount = packageGroups.size;
	lines.push(`imports (${packageCount} packages):`);
	lines.push("");

	// Sort packages alphabetically for consistent output
	const sortedPackages = Array.from(packageGroups.keys()).sort();

	for (const packageKey of sortedPackages) {
		const packageImports = packageGroups.get(packageKey);
		if (!packageImports || packageImports.length === 0) continue;

		// Package header
		lines.push(`${packageKey}:`);

		// Sort imports alphabetically within package
		const sortedImports = packageImports.sort((a, b) =>
			a.node.name.localeCompare(b.node.name),
		);

		// List imported symbols
		for (const imp of sortedImports) {
			// Show imported symbols if available, otherwise show the target file/symbol name
			if (imp.importedSymbols.length > 0) {
				for (const symbol of imp.importedSymbols) {
					const typeOnly = imp.isTypeOnly ? " (type-only)" : "";
					lines.push(`  - ${symbol}${typeOnly}`);
				}
			} else {
				// Fallback: show the node name if no imported symbols metadata
				const typeOnly = imp.isTypeOnly ? " (type-only)" : "";
				lines.push(`  - ${imp.node.name}${typeOnly}`);
			}
		}

		lines.push("");
	}

	return lines.join("\n").trimEnd();
}
