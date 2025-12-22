import type { Edge } from "../../db/Types.js";
import {
	formatLocation,
	formatModulePackageLines,
} from "../shared/nodeFormatters.js";
import type { SymbolLocation } from "../shared/resolveSymbol.js";
import type { DependencyWithEdge } from "./query.js";

/**
 * Group dependencies by package.
 */
function groupByPackage(
	dependencies: DependencyWithEdge[],
): Map<string, DependencyWithEdge[]> {
	const groups = new Map<string, DependencyWithEdge[]>();
	for (const dep of dependencies) {
		const pkg = dep.node.package;
		const existing = groups.get(pkg) ?? [];
		existing.push(dep);
		groups.set(pkg, existing);
	}
	return groups;
}

/**
 * Format dependency context from edge.
 */
function formatDependencyContext(edge: Edge): string {
	if (edge.context) {
		return ` (${edge.context})`;
	}
	return "";
}

/**
 * Format type dependencies for LLM consumption with package grouping.
 *
 * Output format:
 * ```
 * source: createUser
 * type: Function
 * file: modules/backend/packages/api/src/userRoutes.ts
 * offset: 10
 * limit: 6
 * module: backend/api
 * package: api
 *
 * references (3 types across 2 packages):
 *
 * shared/types:
 *   - User (parameter)
 *     offset: 5, limit: 10
 *   - Config (return)
 *     offset: 20, limit: 8
 *
 * backend/validation:
 *   - ValidationError (variable)
 *     offset: 15, limit: 3
 * ```
 */
export function formatTypeDependencies(
	source: SymbolLocation,
	dependencies: DependencyWithEdge[],
): string {
	const lines: string[] = [];

	// Header - machine-readable location for Read tool
	lines.push(`source: ${source.name}`);
	lines.push(`type: ${source.type}`);
	lines.push(`file: ${source.file}`);
	lines.push(`offset: ${source.offset}`);
	lines.push(`limit: ${source.limit}`);
	lines.push(...formatModulePackageLines(source.module, source.package));
	lines.push("");

	if (dependencies.length === 0) {
		lines.push("references (0 types across 0 packages):");
		lines.push("");
		lines.push("(no type dependencies found)");
		return lines.join("\n");
	}

	// Group by package
	const packageGroups = groupByPackage(dependencies);
	lines.push(
		`references (${dependencies.length} types across ${packageGroups.size} packages):`,
	);
	lines.push("");

	// Sort packages alphabetically for consistent output
	const sortedPackages = Array.from(packageGroups.keys()).sort();

	for (const pkg of sortedPackages) {
		const pkgDeps = packageGroups.get(pkg);
		if (!pkgDeps || pkgDeps.length === 0) continue;

		// Package header
		lines.push(`${pkg}:`);

		// Output each dependency with context metadata
		for (const { node, edge } of pkgDeps) {
			const loc = formatLocation(node);
			const context = formatDependencyContext(edge);
			lines.push(`  - ${node.name}${context}`);
			lines.push(`    offset: ${loc.offset}, limit: ${loc.limit}`);
		}

		lines.push("");
	}

	return lines.join("\n").trimEnd();
}
