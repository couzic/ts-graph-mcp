import type Database from "better-sqlite3";

export interface PackageDependency {
  /** Package identifier: "module/package" */
  packageId: string;
  /** Module name */
  module: string;
  /** Package name */
  package: string;
  /** Depth from center (0 = center, 1 = direct dependent, 2+ = transitive) */
  depth: number;
}

export interface PackageDepsResult {
  /** Whether the center package exists */
  centerExists: boolean;
  /** Center package info */
  center: {
    module: string;
    package: string;
  };
  /** All packages in the result (including center) */
  packages: PackageDependency[];
  /** All dependency edges (from → to) */
  dependencies: Array<{
    from: string; // "module/package"
    to: string; // "module/package"
  }>;
}

/**
 * Query all packages that depend on the target package (reverse dependencies).
 *
 * Algorithm:
 * 1. Check if target package exists (has any files)
 * 2. Aggregate file-level IMPORTS to package-level dependencies
 * 3. Use recursive CTE to find transitive reverse dependencies
 * 4. Return both packages and dependency edges
 *
 * @param db - Database connection
 * @param params - Query parameters
 * @returns Package dependency graph
 */
export function queryIncomingPackageDeps(
  db: Database.Database,
  params: {
    module?: string;
    package: string;
    maxDepth: number;
  },
): PackageDepsResult {
  const { module, package: pkg, maxDepth } = params;

  // Check if target package exists
  const existsCheckSql = module
    ? "SELECT 1 FROM nodes WHERE module = ? AND package = ? LIMIT 1"
    : "SELECT 1 FROM nodes WHERE package = ? LIMIT 1";
  const existsParams = module ? [module, pkg] : [pkg];
  const exists = db.prepare(existsCheckSql).get(...existsParams);

  if (!exists) {
    return {
      centerExists: false,
      center: { module: module ?? "", package: pkg },
      packages: [],
      dependencies: [],
    };
  }

  // Build the center package ID for comparison
  // When no module filter is provided, we need to find the actual module from the first node
  let centerModule = module ?? "";
  let centerPackageId: string;

  if (module) {
    centerPackageId = `${module}/${pkg}`;
  } else {
    // No module filter: query for any node with this package name to get the module
    const nodeQuery = "SELECT module FROM nodes WHERE package = ? LIMIT 1";
    const nodeRow = db.prepare(nodeQuery).get(pkg) as
      | { module: string }
      | undefined;
    if (nodeRow) {
      centerModule = nodeRow.module;
      centerPackageId = `${nodeRow.module}/${pkg}`;
    } else {
      // Shouldn't happen since we checked exists above
      centerPackageId = pkg;
    }
  }

  // Query 1: Find all dependent packages using recursive CTE
  const packagesSql = `
    WITH RECURSIVE
    -- Aggregate file-level IMPORTS to package-level dependencies
    package_imports AS (
      SELECT DISTINCT
        source_node.module || '/' || source_node.package AS from_pkg,
        target_node.module || '/' || target_node.package AS to_pkg
      FROM edges e
      JOIN nodes source_node ON e.source = source_node.id
      JOIN nodes target_node ON e.target = target_node.id
      WHERE e.type = 'IMPORTS'
        AND source_node.type = 'File'
        AND target_node.type = 'File'
        -- Exclude self-imports (same package)
        AND (source_node.module || '/' || source_node.package) != (target_node.module || '/' || target_node.package)
    ),
    -- Recursive traversal: find packages that depend on target (reverse direction)
    dependents(pkg_id, depth) AS (
      -- Base case: center package at depth 0
      SELECT ? AS pkg_id, 0 AS depth

      UNION

      -- Recursive case: find packages that import current packages
      SELECT pi.from_pkg, d.depth + 1
      FROM package_imports pi
      JOIN dependents d ON pi.to_pkg = d.pkg_id
      WHERE d.depth < ?
    )
    SELECT DISTINCT pkg_id, MIN(depth) AS depth
    FROM dependents
    GROUP BY pkg_id
    ORDER BY depth, pkg_id
  `;

  const packagesRows = db
    .prepare(packagesSql)
    .all(centerPackageId, maxDepth) as Array<{
    pkg_id: string;
    depth: number;
  }>;

  // Parse package results
  const packages: PackageDependency[] = packagesRows.map((row) => {
    const [pkgModule, pkgName] = row.pkg_id.includes("/")
      ? row.pkg_id.split("/")
      : ["", row.pkg_id];
    return {
      packageId: row.pkg_id,
      module: pkgModule || "",
      package: pkgName || row.pkg_id,
      depth: row.depth,
    };
  });

  // Query 2: Find all edges between the discovered packages
  const packageIds = packages.map((p) => p.packageId);
  if (packageIds.length === 0) {
    return {
      centerExists: true,
      center: { module: centerModule, package: pkg },
      packages: [],
      dependencies: [],
    };
  }

  const placeholders = packageIds.map(() => "?").join(", ");
  const edgesSql = `
    SELECT DISTINCT
      source_node.module || '/' || source_node.package AS from_pkg,
      target_node.module || '/' || target_node.package AS to_pkg
    FROM edges e
    JOIN nodes source_node ON e.source = source_node.id
    JOIN nodes target_node ON e.target = target_node.id
    WHERE e.type = 'IMPORTS'
      AND source_node.type = 'File'
      AND target_node.type = 'File'
      AND (source_node.module || '/' || source_node.package) IN (${placeholders})
      AND (target_node.module || '/' || target_node.package) IN (${placeholders})
      AND (source_node.module || '/' || source_node.package) != (target_node.module || '/' || target_node.package)
  `;

  const edgesRows = db
    .prepare(edgesSql)
    .all(...packageIds, ...packageIds) as Array<{
    from_pkg: string;
    to_pkg: string;
  }>;

  const dependencies = edgesRows.map((row) => ({
    from: row.from_pkg,
    to: row.to_pkg,
  }));

  return {
    centerExists: true,
    center: { module: centerModule, package: pkg },
    packages,
    dependencies,
  };
}
