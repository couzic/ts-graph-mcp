import type Database from "better-sqlite3";

/**
 * Represents a package node in the dependency graph.
 */
export interface PackageNode {
	module: string;
	package: string;
	depth: number;
}

/**
 * Represents a dependency edge between packages.
 */
export interface PackageDependency {
	fromModule: string;
	fromPackage: string;
	toModule: string;
	toPackage: string;
}

/**
 * Result of package dependency query.
 */
export interface PackageDepsResult {
	packages: PackageNode[];
	dependencies: PackageDependency[];
}

/**
 * Query package dependencies by aggregating file-level IMPORTS edges.
 *
 * Strategy:
 * 1. Build package-to-package graph from file IMPORTS edges
 * 2. Use recursive CTE to find transitive dependencies up to maxDepth
 * 3. Return both packages and edges for visualization
 *
 * @param db - Database connection
 * @param module - Target module name
 * @param pkg - Target package name
 * @param maxDepth - Maximum traversal depth (default: 100 = all reachable)
 * @returns Package nodes and dependency edges
 */
export function queryPackageDeps(
	db: Database.Database,
	module: string,
	pkg: string,
	maxDepth = 100,
): PackageDepsResult {
	// Step 1: Find all reachable packages using recursive CTE
	const packagesSql = `
    WITH RECURSIVE
    -- Aggregate file-level IMPORTS to package-level dependencies
    package_edges AS (
      SELECT DISTINCT
        source_node.module AS from_module,
        source_node.package AS from_package,
        target_node.module AS to_module,
        target_node.package AS to_package
      FROM edges e
      JOIN nodes source_node ON e.source = source_node.id
      JOIN nodes target_node ON e.target = target_node.id
      WHERE e.type = 'IMPORTS'
        AND source_node.type = 'File'
        AND target_node.type = 'File'
        -- Exclude self-dependencies (same package)
        AND NOT (source_node.module = target_node.module AND source_node.package = target_node.package)
    ),

    -- Recursive traversal from target package
    package_deps(module, package, depth) AS (
      -- Base case: direct dependencies of target package
      SELECT to_module, to_package, 1 AS depth
      FROM package_edges
      WHERE from_module = ? AND from_package = ?

      UNION

      -- Recursive case: dependencies of dependencies
      SELECT pe.to_module, pe.to_package, pd.depth + 1
      FROM package_edges pe
      JOIN package_deps pd
        ON pe.from_module = pd.module AND pe.from_package = pd.package
      WHERE pd.depth < ?
    )

    SELECT module, package, MIN(depth) AS depth
    FROM package_deps
    GROUP BY module, package
  `;

	interface PackageRow {
		module: string;
		package: string;
		depth: number;
	}

	const packagesStmt = db.prepare<[string, string, number], PackageRow>(
		packagesSql,
	);
	const packageRows = packagesStmt.all(module, pkg, maxDepth);

	const packages: PackageNode[] = packageRows.map((row) => ({
		module: row.module,
		package: row.package,
		depth: row.depth,
	}));

	// Step 2: Query edges between reachable packages (including center)
	if (packages.length === 0) {
		return { packages: [], dependencies: [] };
	}

	// Build a set of reachable package IDs
	const reachablePackages = new Set<string>();
	reachablePackages.add(`${module}/${pkg}`); // center package
	for (const p of packages) {
		reachablePackages.add(`${p.module}/${p.package}`);
	}

	// Query edges where both source and target are in reachable set
	const edgesSql = `
    SELECT DISTINCT
      source_node.module AS from_module,
      source_node.package AS from_package,
      target_node.module AS to_module,
      target_node.package AS to_package
    FROM edges e
    JOIN nodes source_node ON e.source = source_node.id
    JOIN nodes target_node ON e.target = target_node.id
    WHERE e.type = 'IMPORTS'
      AND source_node.type = 'File'
      AND target_node.type = 'File'
      AND NOT (source_node.module = target_node.module AND source_node.package = target_node.package)
  `;

	interface EdgeRow {
		from_module: string;
		from_package: string;
		to_module: string;
		to_package: string;
	}

	const edgesStmt = db.prepare<[], EdgeRow>(edgesSql);
	const allEdges = edgesStmt.all();

	// Filter edges to only include those in the reachable set
	const dependencies: PackageDependency[] = [];
	const seen = new Set<string>();

	for (const edge of allEdges) {
		const fromKey = `${edge.from_module}/${edge.from_package}`;
		const toKey = `${edge.to_module}/${edge.to_package}`;

		if (reachablePackages.has(fromKey) && reachablePackages.has(toKey)) {
			const edgeKey = `${fromKey}->${toKey}`;
			if (!seen.has(edgeKey)) {
				seen.add(edgeKey);
				dependencies.push({
					fromModule: edge.from_module,
					fromPackage: edge.from_package,
					toModule: edge.to_module,
					toPackage: edge.to_package,
				});
			}
		}
	}

	return { packages, dependencies };
}
