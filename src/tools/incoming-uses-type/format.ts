import type { Edge } from "../../db/Types.js";
import {
	formatLocation,
	formatModulePackageLines,
} from "../shared/nodeFormatters.js";
import type { SymbolLocation } from "../shared/resolveSymbol.js";
import type { UsageWithEdge } from "./query.js";

/**
 * Group usages by package.
 */
function groupByPackage(usages: UsageWithEdge[]): Map<string, UsageWithEdge[]> {
	const groups = new Map<string, UsageWithEdge[]>();
	for (const usage of usages) {
		const pkg = usage.node.package;
		const existing = groups.get(pkg) ?? [];
		existing.push(usage);
		groups.set(pkg, existing);
	}
	return groups;
}

/**
 * Format usage context from edge.
 */
function formatUsageContext(edge: Edge): string {
	if (edge.context) {
		return ` (${edge.context})`;
	}
	return "";
}

/**
 * Format type usages for LLM consumption with package grouping.
 *
 * Output format:
 * ```
 * type: User
 * file: modules/shared/packages/types/src/User.ts
 * offset: 1
 * limit: 15
 * module: shared/types
 * package: types
 *
 * used by (15 symbols across 2 packages):
 *
 * backend/api:
 *   - handleCreateUser (parameter)
 *     offset: 10, limit: 5
 *   - handleGetUser (return)
 *     offset: 20, limit: 3
 *
 * backend/services:
 *   - createUserService (parameter)
 *     offset: 15, limit: 8
 *   - getUserById (return)
 *     offset: 25, limit: 4
 * ```
 */
export function formatTypeUsages(
	target: SymbolLocation,
	usages: UsageWithEdge[],
): string {
	const lines: string[] = [];

	// Header - machine-readable location for Read tool
	lines.push(`type: ${target.name}`);
	lines.push(`file: ${target.file}`);
	lines.push(`offset: ${target.offset}`);
	lines.push(`limit: ${target.limit}`);
	lines.push(...formatModulePackageLines(target.module, target.package));
	lines.push("");

	if (usages.length === 0) {
		lines.push("used by (0 symbols across 0 packages):");
		lines.push("");
		lines.push("(no usages found)");
		return lines.join("\n");
	}

	// Group by package
	const packageGroups = groupByPackage(usages);
	lines.push(
		`used by (${usages.length} symbols across ${packageGroups.size} packages):`,
	);
	lines.push("");

	// Sort packages alphabetically for consistent output
	const sortedPackages = Array.from(packageGroups.keys()).sort();

	for (const pkg of sortedPackages) {
		const pkgUsages = packageGroups.get(pkg);
		if (!pkgUsages || pkgUsages.length === 0) continue;

		// Package header
		lines.push(`${pkg}:`);

		// Output each usage with context metadata
		for (const { node, edge } of pkgUsages) {
			const loc = formatLocation(node);
			const context = formatUsageContext(edge);
			lines.push(`  - ${node.name}${context}`);
			lines.push(`    offset: ${loc.offset}, limit: ${loc.limit}`);
		}

		lines.push("");
	}

	return lines.join("\n").trimEnd();
}
