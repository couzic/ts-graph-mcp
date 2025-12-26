import type { PackageDepsResult } from "./query.js";

/**
 * Format package dependencies as hierarchical text.
 *
 * Output format:
 * ```
 * center: shared/types
 * direction: incoming
 * depth: 2
 *
 * packages (4):
 *   shared/types (center)
 *   backend/api (depth 1)
 *   backend/services (depth 1)
 *   frontend/ui (depth 2)
 *
 * dependents (3):
 *   backend/api → shared/types
 *   backend/services → shared/types
 *   frontend/ui → backend/api
 * ```
 */
function formatText(result: PackageDepsResult): string {
  const lines: string[] = [];

  const centerPackageId =
    result.center.module && result.center.module !== ""
      ? `${result.center.module}/${result.center.package}`
      : result.center.package;

  const maxDepth = Math.max(...result.packages.map((p) => p.depth), 0);

  lines.push(`center: ${centerPackageId}`);
  lines.push("direction: incoming");
  lines.push(`depth: ${maxDepth}`);
  lines.push("");

  // Packages section
  lines.push(`packages (${result.packages.length}):`);
  for (const pkg of result.packages) {
    if (pkg.depth === 0) {
      lines.push(`  ${pkg.packageId} (center)`);
    } else {
      lines.push(`  ${pkg.packageId} (depth ${pkg.depth})`);
    }
  }
  lines.push("");

  // Dependencies section
  lines.push(`dependents (${result.dependencies.length}):`);
  if (result.dependencies.length === 0) {
    lines.push("  (no dependents found)");
  } else {
    for (const dep of result.dependencies) {
      lines.push(`  ${dep.from} → ${dep.to}`);
    }
  }

  return lines.join("\n");
}

/**
 * Format package dependencies as Mermaid diagram.
 *
 * Groups packages by module using subgraphs.
 *
 * Output format:
 * ```mermaid
 * graph LR
 *   subgraph shared
 *     types[shared/types]
 *   end
 *   subgraph backend
 *     api[backend/api]
 *     services[backend/services]
 *   end
 *   subgraph frontend
 *     ui[frontend/ui]
 *   end
 *   api --> types
 *   services --> types
 *   ui --> api
 * ```
 */
function formatMermaid(result: PackageDepsResult): string {
  const lines: string[] = [];

  lines.push("```mermaid");
  lines.push("graph LR");

  // Group packages by module
  const moduleGroups = new Map<string, string[]>();
  for (const pkg of result.packages) {
    const module = pkg.module || "default";
    const existing = moduleGroups.get(module) ?? [];
    existing.push(pkg.packageId);
    moduleGroups.set(module, existing);
  }

  // Output subgraphs for each module
  for (const [module, packages] of moduleGroups) {
    if (module === "default") {
      // No module grouping for packages without module
      for (const pkgId of packages) {
        const nodeName = pkgId.replace(/[/-]/g, "_");
        lines.push(`  ${nodeName}[${pkgId}]`);
      }
    } else {
      lines.push(`  subgraph ${module}`);
      for (const pkgId of packages) {
        const [, pkgName] = pkgId.split("/");
        const nodeName = pkgId.replace(/[/-]/g, "_");
        lines.push(`    ${nodeName}[${pkgName}]`);
      }
      lines.push("  end");
    }
  }

  // Output edges
  for (const dep of result.dependencies) {
    const fromNode = dep.from.replace(/[/-]/g, "_");
    const toNode = dep.to.replace(/[/-]/g, "_");
    lines.push(`  ${fromNode} --> ${toNode}`);
  }

  lines.push("```");

  return lines.join("\n");
}

/**
 * Format package dependencies for LLM consumption.
 *
 * @param result - Package dependency graph
 * @param outputTypes - Output formats to include
 * @returns Formatted string
 */
export function formatIncomingPackageDeps(
  result: PackageDepsResult,
  outputTypes: ("text" | "mermaid")[],
): string {
  const outputs: string[] = [];

  for (const type of outputTypes) {
    if (type === "text") {
      outputs.push(formatText(result));
    } else if (type === "mermaid") {
      outputs.push(formatMermaid(result));
    }
  }

  return outputs.join("\n\n");
}
