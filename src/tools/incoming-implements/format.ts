import type { Node } from "../../db/Types.js";
import { formatLocation } from "../shared/nodeFormatters.js";
import type { SymbolLocation } from "../shared/resolveSymbol.js";

/**
 * Group implementers by package.
 */
function groupByPackage(implementers: Node[]): Map<string, Node[]> {
	const groups = new Map<string, Node[]>();
	for (const implementer of implementers) {
		const pkg = implementer.package;
		const existing = groups.get(pkg) ?? [];
		existing.push(implementer);
		groups.set(pkg, existing);
	}
	return groups;
}

/**
 * Format implementers for LLM consumption with package grouping.
 *
 * Output format:
 * ```
 * interface: Auditable
 * type: Interface
 * offset: 16
 * limit: 4
 * module: test
 * package: main
 *
 * implementations (1 packages):
 *
 * test/main:
 *   - AuditLog (Class) [src/models.ts:31-39]
 *     offset: 31, limit: 9
 * ```
 */
export function formatImplementers(
	target: SymbolLocation,
	implementers: Node[],
): string {
	const lines: string[] = [];

	// Header - machine-readable location for Read tool
	lines.push(`interface: ${target.name}`);
	lines.push(`type: ${target.type}`);
	lines.push(`offset: ${target.offset}`);
	lines.push(`limit: ${target.limit}`);
	lines.push(`module: ${target.module}`);
	lines.push(`package: ${target.package}`);
	lines.push("");

	if (implementers.length === 0) {
		lines.push("implementations (0 packages):");
		lines.push("");
		lines.push("(no implementations found)");
		return lines.join("\n");
	}

	// Group by package
	const packageGroups = groupByPackage(implementers);
	lines.push(`implementations (${packageGroups.size} packages):`);
	lines.push("");

	// Sort packages alphabetically for consistent output
	const sortedPackages = Array.from(packageGroups.keys()).sort();

	for (const pkg of sortedPackages) {
		const pkgImplementers = packageGroups.get(pkg);
		if (!pkgImplementers || pkgImplementers.length === 0) continue;

		// Package header
		lines.push(`${pkg}:`);

		// Output each implementer
		for (const node of pkgImplementers) {
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
