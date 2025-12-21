import type { Node } from "../../db/Types.js";
import { formatLocation } from "../shared/nodeFormatters.js";
import type { SymbolLocation } from "../shared/resolveSymbol.js";

/**
 * Group interfaces by package.
 */
function groupByPackage(interfaces: Node[]): Map<string, Node[]> {
	const groups = new Map<string, Node[]>();
	for (const iface of interfaces) {
		const pkg = iface.package;
		const existing = groups.get(pkg) ?? [];
		existing.push(iface);
		groups.set(pkg, existing);
	}
	return groups;
}

/**
 * Format interfaces for LLM consumption with package grouping.
 *
 * Output format:
 * ```
 * class: AuditLog
 * type: Class
 * offset: 31
 * limit: 9
 * module: test
 * package: main
 *
 * implements (1 packages):
 *
 * test/main:
 *   - Auditable (Interface) [src/types.ts:16-19]
 *     offset: 16, limit: 4
 * ```
 */
export function formatInterfaces(
	target: SymbolLocation,
	interfaces: Node[],
): string {
	const lines: string[] = [];

	// Header - machine-readable location for Read tool
	lines.push(`class: ${target.name}`);
	lines.push(`type: ${target.type}`);
	lines.push(`offset: ${target.offset}`);
	lines.push(`limit: ${target.limit}`);
	lines.push(`module: ${target.module}`);
	lines.push(`package: ${target.package}`);
	lines.push("");

	if (interfaces.length === 0) {
		lines.push("implements (0 packages):");
		lines.push("");
		lines.push("(no interfaces implemented)");
		return lines.join("\n");
	}

	// Group by package
	const packageGroups = groupByPackage(interfaces);
	lines.push(`implements (${packageGroups.size} packages):`);
	lines.push("");

	// Sort packages alphabetically for consistent output
	const sortedPackages = Array.from(packageGroups.keys()).sort();

	for (const pkg of sortedPackages) {
		const pkgInterfaces = packageGroups.get(pkg);
		if (!pkgInterfaces || pkgInterfaces.length === 0) continue;

		// Package header
		lines.push(`${pkg}:`);

		// Output each interface
		for (const node of pkgInterfaces) {
			const loc = formatLocation(node);
			lines.push(
				`  - ${node.name} (${node.type}) [${node.filePath}:${node.startLine}-${node.endLine}]`,
			);
			lines.push(`    offset: ${loc.offset}, limit: ${loc.limit}`);
		}

		lines.push("");
	}

	return lines.join("\n").trimEnd();
}
