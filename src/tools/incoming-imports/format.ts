import type { Edge } from "../../db/Types.js";
import {
	formatLocation,
	formatModulePackageLines,
} from "../shared/nodeFormatters.js";
import type { SymbolLocation } from "../shared/resolveSymbol.js";
import type { ImporterWithEdge } from "./query.js";

/**
 * Group importers by package.
 */
function groupByPackage(
	importers: ImporterWithEdge[],
): Map<string, ImporterWithEdge[]> {
	const groups = new Map<string, ImporterWithEdge[]>();
	for (const importer of importers) {
		const pkg = importer.node.package;
		const existing = groups.get(pkg) ?? [];
		existing.push(importer);
		groups.set(pkg, existing);
	}
	return groups;
}

/**
 * Format import metadata from edge.
 */
function formatImportMetadata(edge: Edge): string {
	const parts: string[] = [];

	if (edge.importedSymbols && edge.importedSymbols.length > 0) {
		parts.push(edge.importedSymbols.join(", "));
	}

	if (edge.isTypeOnly) {
		parts.push("type-only");
	}

	return parts.length > 0 ? ` (${parts.join(", ")})` : "";
}

/**
 * Format importers for LLM consumption with package grouping.
 *
 * Output format:
 * ```
 * file: modules/shared/packages/types/src/User.ts
 * type: File
 * offset: 1
 * limit: 20
 * module: shared/types
 * package: types
 *
 * imported by (3 packages):
 *
 * backend/api:
 *   - userRoutes.ts (User, type-only)
 *     offset: 1, limit: 50
 *
 * backend/services:
 *   - userService.ts (User, createUser)
 *     offset: 1, limit: 30
 *
 * frontend/ui:
 *   - UserCard.ts (User, type-only)
 *     offset: 1, limit: 25
 * ```
 */
export function formatImporters(
	target: SymbolLocation,
	importers: ImporterWithEdge[],
): string {
	const lines: string[] = [];

	// Header - machine-readable location for Read tool
	lines.push(`file: ${target.file}`);
	lines.push(`type: ${target.type}`);
	lines.push(`offset: ${target.offset}`);
	lines.push(`limit: ${target.limit}`);
	lines.push(...formatModulePackageLines(target.module, target.package));
	lines.push("");

	if (importers.length === 0) {
		lines.push("imported by (0 packages):");
		lines.push("");
		lines.push("(no importers found)");
		return lines.join("\n");
	}

	// Group by package
	const packageGroups = groupByPackage(importers);
	lines.push(`imported by (${packageGroups.size} packages):`);
	lines.push("");

	// Sort packages alphabetically for consistent output
	const sortedPackages = Array.from(packageGroups.keys()).sort();

	for (const pkg of sortedPackages) {
		const pkgImporters = packageGroups.get(pkg);
		if (!pkgImporters || pkgImporters.length === 0) continue;

		// Package header
		lines.push(`${pkg}:`);

		// Output each importer with metadata
		for (const { node, edge } of pkgImporters) {
			const loc = formatLocation(node);
			const metadata = formatImportMetadata(edge);
			lines.push(`  - ${node.filePath}${metadata}`);
			lines.push(`    offset: ${loc.offset}, limit: ${loc.limit}`);
		}

		lines.push("");
	}

	return lines.join("\n").trimEnd();
}
