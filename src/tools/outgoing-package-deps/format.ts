import type { PackageDepsResult } from "./query.js";

/**
 * Format package dependencies for LLM consumption.
 *
 * Supports two output formats:
 * 1. text - Human-readable hierarchical text
 * 2. mermaid - Mermaid diagram for visualization
 *
 * @param module - Center package module
 * @param pkg - Center package name
 * @param result - Query result with packages and dependencies
 * @param outputTypes - Requested output formats
 * @returns Formatted string
 */
export function formatText(
	module: string,
	pkg: string,
	result: PackageDepsResult,
	outputTypes: ("text" | "mermaid")[],
): string {
	const sections: string[] = [];

	// Text format
	if (outputTypes.includes("text")) {
		sections.push(formatTextOutput(module, pkg, result));
	}

	// Mermaid format
	if (outputTypes.includes("mermaid")) {
		sections.push(formatMermaidOutput(module, pkg, result));
	}

	return sections.join("\n\n");
}

/**
 * Format text output.
 *
 * Example:
 * ```
 * center: backend/api
 * direction: outgoing
 * depth: 2
 *
 * packages (4):
 *   backend/api (center)
 *   backend/services (depth 1)
 *   shared/types (depth 1)
 *   shared/utils (depth 2)
 *
 * dependencies (3):
 *   backend/api → backend/services
 *   backend/api → shared/types
 *   backend/services → shared/utils
 * ```
 */
function formatTextOutput(
	module: string,
	pkg: string,
	result: PackageDepsResult,
): string {
	const lines: string[] = [];

	// Header
	lines.push(`center: ${module}/${pkg}`);
	lines.push("direction: outgoing");

	// Calculate max depth
	const maxDepth = Math.max(0, ...result.packages.map((p) => p.depth));
	lines.push(`depth: ${maxDepth}`);
	lines.push("");

	// Include center package in count
	const totalPackages = result.packages.length + 1;
	lines.push(`packages (${totalPackages}):`);

	// Center package (depth 0)
	lines.push(`  ${module}/${pkg} (center)`);

	// Sort packages by depth, then alphabetically
	const sorted = [...result.packages].sort((a, b) => {
		if (a.depth !== b.depth) return a.depth - b.depth;
		const aKey = `${a.module}/${a.package}`;
		const bKey = `${b.module}/${b.package}`;
		return aKey.localeCompare(bKey);
	});

	for (const p of sorted) {
		lines.push(`  ${p.module}/${p.package} (depth ${p.depth})`);
	}

	lines.push("");

	// Dependencies
	if (result.dependencies.length === 0) {
		lines.push("dependencies: none");
	} else {
		lines.push(`dependencies (${result.dependencies.length}):`);

		// Sort dependencies alphabetically
		const sortedDeps = [...result.dependencies].sort((a, b) => {
			const aKey = `${a.fromModule}/${a.fromPackage}`;
			const bKey = `${b.fromModule}/${b.fromPackage}`;
			return aKey.localeCompare(bKey);
		});

		for (const dep of sortedDeps) {
			lines.push(
				`  ${dep.fromModule}/${dep.fromPackage} → ${dep.toModule}/${dep.toPackage}`,
			);
		}
	}

	return lines.join("\n");
}

/**
 * Format Mermaid diagram.
 *
 * Example:
 * ```mermaid
 * graph LR
 *   subgraph backend
 *     api[backend/api]
 *     services[backend/services]
 *   end
 *   subgraph shared
 *     types[shared/types]
 *     utils[shared/utils]
 *   end
 *   api --> services
 *   api --> types
 *   services --> utils
 * ```
 */
function formatMermaidOutput(
	module: string,
	pkg: string,
	result: PackageDepsResult,
): string {
	const lines: string[] = [];
	lines.push("```mermaid");
	lines.push("graph LR");

	// Collect all unique modules
	const modules = new Set<string>();
	modules.add(module);
	for (const p of result.packages) {
		modules.add(p.module);
	}

	// Group packages by module
	const packagesByModule = new Map<string, string[]>();
	packagesByModule.set(module, [pkg]);

	for (const p of result.packages) {
		const packages = packagesByModule.get(p.module) ?? [];
		packages.push(p.package);
		packagesByModule.set(p.module, packages);
	}

	// Generate subgraphs
	const sortedModules = Array.from(modules).sort();
	for (const mod of sortedModules) {
		const packages = packagesByModule.get(mod) ?? [];
		if (packages.length === 0) continue;

		lines.push(`  subgraph ${mod}`);
		for (const p of packages.sort()) {
			lines.push(`    ${sanitizeId(p)}[${mod}/${p}]`);
		}
		lines.push("  end");
	}

	// Generate edges
	if (result.dependencies.length > 0) {
		for (const dep of result.dependencies) {
			const fromId = sanitizeId(dep.fromPackage);
			const toId = sanitizeId(dep.toPackage);
			lines.push(`  ${fromId} --> ${toId}`);
		}
	}

	lines.push("```");
	return lines.join("\n");
}

/**
 * Sanitize package name for use as Mermaid node ID.
 * Replace special characters with underscores.
 */
function sanitizeId(name: string): string {
	return name.replace(/[^a-zA-Z0-9_]/g, "_");
}
