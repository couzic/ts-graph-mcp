import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, normalize, resolve } from "node:path";

/**
 * Maps package names to their absolute source entry paths.
 *
 * @example
 * Map {
 *   "@libs/error-utils" => "/path/to/libs/error-utils/src/index.ts",
 *   "@libs/toolkit" => "/path/to/libs/toolkit/src/index.ts"
 * }
 */
export type WorkspaceMap = Map<string, string>;

/**
 * Build a workspace map for a monorepo by parsing package.json workspaces.
 *
 * Maps each package name (from its package.json) to its source entry file path.
 * Handles glob patterns like `"libs/*"` and nested workspaces recursively.
 *
 * If a package's source entry cannot be determined, it's omitted from the map.
 * Cross-package imports to that package will not create edges in the graph.
 *
 * @example
 * // Given a monorepo with:
 * // - package.json: { "workspaces": ["libs/*", "modules/app/packages/*"] }
 * // - libs/toolkit/package.json: { "name": "@libs/toolkit" }
 * // - libs/toolkit/src/index.ts
 *
 * buildWorkspaceMap("/path/to/monorepo")
 * // => Map {
 * //   "@libs/toolkit" => "/path/to/monorepo/libs/toolkit/src/index.ts",
 * //   ...
 * // }
 */
export const buildWorkspaceMap = (workspaceRoot: string): WorkspaceMap => {
  const result: WorkspaceMap = new Map();
  const absoluteRoot = resolve(workspaceRoot);

  processWorkspaceRoot(absoluteRoot, result);

  return result;
};

/**
 * Process a directory that may contain a package.json with workspaces.
 */
const processWorkspaceRoot = (
  directory: string,
  result: WorkspaceMap,
): void => {
  const packageJsonPath = join(directory, "package.json");

  if (!existsSync(packageJsonPath)) {
    return;
  }

  const packageJson = parsePackageJson(packageJsonPath);
  if (!packageJson) {
    return;
  }

  const workspaces = extractWorkspaces(packageJson);
  if (workspaces.length === 0) {
    return;
  }

  for (const workspaceGlob of workspaces) {
    const packageDirs = expandWorkspaceGlob(directory, workspaceGlob);

    for (const packageDir of packageDirs) {
      processPackageDirectory(packageDir, result);
    }
  }
};

/**
 * Process a single package directory: extract name and find source entry.
 */
const processPackageDirectory = (
  packageDir: string,
  result: WorkspaceMap,
): void => {
  const packageJsonPath = join(packageDir, "package.json");

  if (!existsSync(packageJsonPath)) {
    return;
  }

  const packageJson = parsePackageJson(packageJsonPath);
  if (!packageJson) {
    return;
  }

  // biome-ignore lint/complexity/useLiteralKeys: index signature
  const packageName = packageJson["name"];
  if (typeof packageName !== "string" || packageName.length === 0) {
    return;
  }

  const sourceEntry = findSourceEntry(packageDir);
  if (sourceEntry) {
    result.set(packageName, sourceEntry);
  }

  // Handle nested workspaces recursively
  const nestedWorkspaces = extractWorkspaces(packageJson);
  if (nestedWorkspaces.length > 0) {
    processWorkspaceRoot(packageDir, result);
  }
};

/**
 * Safely parse a package.json file.
 */
const parsePackageJson = (path: string): Record<string, unknown> | null => {
  try {
    const content = readFileSync(path, "utf-8");
    return JSON.parse(content) as Record<string, unknown>;
  } catch {
    return null;
  }
};

/**
 * Extract workspaces array from package.json.
 * Handles both array format and object format with "packages" field.
 */
const extractWorkspaces = (packageJson: Record<string, unknown>): string[] => {
  // biome-ignore lint/complexity/useLiteralKeys: index signature
  const workspaces = packageJson["workspaces"];

  // Array format: "workspaces": ["libs/*", "packages/*"]
  if (Array.isArray(workspaces)) {
    return workspaces.filter((w): w is string => typeof w === "string");
  }

  // Object format: "workspaces": { "packages": ["libs/*"] }
  if (typeof workspaces === "object" && workspaces !== null) {
    // biome-ignore lint/complexity/useLiteralKeys: index signature
    const packages = (workspaces as Record<string, unknown>)["packages"];
    if (Array.isArray(packages)) {
      return packages.filter((p): p is string => typeof p === "string");
    }
  }

  return [];
};

/**
 * Expand a workspace glob pattern to matching directories.
 *
 * Supports:
 * - Simple globs: "libs/*" → all directories in libs/
 * - Deep paths: "modules/app/packages/*" → all directories in modules/app/packages/
 * - No glob: "packages/core" → just packages/core if it exists
 */
const expandWorkspaceGlob = (baseDir: string, pattern: string): string[] => {
  // Handle patterns ending with /*
  if (pattern.endsWith("/*")) {
    const parentPath = pattern.slice(0, -2);
    const absoluteParent = join(baseDir, parentPath);

    if (!existsSync(absoluteParent)) {
      return [];
    }

    try {
      const entries = readdirSync(absoluteParent);
      return entries
        .map((entry) => join(absoluteParent, entry))
        .filter((fullPath) => {
          try {
            return statSync(fullPath).isDirectory();
          } catch {
            return false;
          }
        });
    } catch {
      return [];
    }
  }

  // Handle patterns ending with /** (recursive)
  if (pattern.endsWith("/**")) {
    const parentPath = pattern.slice(0, -3);
    const absoluteParent = join(baseDir, parentPath);

    if (!existsSync(absoluteParent)) {
      return [];
    }

    return findAllPackageDirectories(absoluteParent);
  }

  // No glob - direct path
  const absolutePath = join(baseDir, pattern);
  if (existsSync(absolutePath)) {
    try {
      if (statSync(absolutePath).isDirectory()) {
        return [absolutePath];
      }
    } catch {
      // Ignore stat errors
    }
  }

  return [];
};

/**
 * Recursively find all directories containing a package.json.
 */
const findAllPackageDirectories = (directory: string): string[] => {
  const results: string[] = [];

  try {
    const entries = readdirSync(directory);

    for (const entry of entries) {
      // Skip node_modules and hidden directories
      if (entry === "node_modules" || entry.startsWith(".")) {
        continue;
      }

      const fullPath = join(directory, entry);
      try {
        if (!statSync(fullPath).isDirectory()) {
          continue;
        }
      } catch {
        continue;
      }

      // Check if this directory has a package.json
      if (existsSync(join(fullPath, "package.json"))) {
        results.push(fullPath);
      }

      // Recurse into subdirectories
      results.push(...findAllPackageDirectories(fullPath));
    }
  } catch {
    // Ignore read errors
  }

  return results;
};

/**
 * Find the source entry file for a package by inferring from package.json and tsconfig.json.
 *
 * Algorithm:
 * 1. Read package.json `main` field (e.g., "./dist/index.js")
 * 2. Read tsconfig.json `outDir` and `rootDir` (e.g., "./dist", "./src")
 * 3. Map: replace outDir prefix with rootDir, and .js/.mjs/.cjs with .ts/.tsx
 * 4. Verify file exists
 *
 * Returns the source entry path, or null if not found.
 */
const findSourceEntry = (packageDir: string): string | null => {
  const packageJsonPath = join(packageDir, "package.json");
  const packageJson = parsePackageJson(packageJsonPath);
  if (!packageJson) {
    return null;
  }

  // biome-ignore lint/complexity/useLiteralKeys: index signature
  const main = packageJson["main"];
  if (typeof main !== "string") {
    return null;
  }

  // Read tsconfig.json for outDir/rootDir mapping
  const tsconfigPath = join(packageDir, "tsconfig.json");
  const tsconfig = parseTsconfig(tsconfigPath);
  if (!tsconfig) {
    return null;
  }

  const outDir = normalizeDir(tsconfig.outDir ?? ".");
  const rootDir = normalizeDir(tsconfig.rootDir ?? ".");

  // Map dist path to source path
  const normalizedMain = normalizeDir(main);

  // Handle the case where outDir is "." (root directory)
  let relativePath: string;
  if (outDir === ".") {
    relativePath = normalizedMain;
  } else if (normalizedMain.startsWith(`${outDir}/`)) {
    relativePath = normalizedMain.slice(outDir.length + 1);
  } else if (normalizedMain === outDir) {
    relativePath = "";
  } else {
    return null;
  }

  // Replace outDir with rootDir and .js with .ts
  const sourcePath =
    rootDir === "."
      ? relativePath.replace(/\.(js|mjs|cjs)$/, ".ts")
      : join(rootDir, relativePath).replace(/\.(js|mjs|cjs)$/, ".ts");
  const fullPath = join(packageDir, sourcePath);

  if (existsSync(fullPath)) {
    return fullPath;
  }

  // Try .tsx as fallback
  const tsxPath = fullPath.replace(/\.ts$/, ".tsx");
  if (existsSync(tsxPath)) {
    return tsxPath;
  }

  // If rootDir was not explicitly set and the direct path doesn't exist,
  // try common source directories like "src/"
  if (tsconfig.rootDir === undefined) {
    const srcPath = join(
      packageDir,
      "src",
      relativePath.replace(/\.(js|mjs|cjs)$/, ".ts"),
    );
    if (existsSync(srcPath)) {
      return srcPath;
    }
    const srcTsxPath = srcPath.replace(/\.ts$/, ".tsx");
    if (existsSync(srcTsxPath)) {
      return srcTsxPath;
    }
  }

  return null;
};

/**
 * Normalize a directory path for comparison.
 * Removes leading ./ and ensures no trailing slash.
 */
const normalizeDir = (dir: string): string => {
  let normalized = normalize(dir);
  if (normalized.startsWith("./")) {
    normalized = normalized.slice(2);
  }
  if (normalized.endsWith("/")) {
    normalized = normalized.slice(0, -1);
  }
  return normalized;
};

/**
 * Parse tsconfig.json and extract relevant compiler options.
 */
const parseTsconfig = (
  path: string,
): { outDir?: string; rootDir?: string } | null => {
  if (!existsSync(path)) {
    return null;
  }
  try {
    const content = readFileSync(path, "utf-8");
    const parsed = JSON.parse(content) as Record<string, unknown>;
    // biome-ignore lint/complexity/useLiteralKeys: index signature
    const compilerOptions = parsed["compilerOptions"] as
      | Record<string, unknown>
      | undefined;
    if (!compilerOptions) {
      return {};
    }
    // biome-ignore lint/complexity/useLiteralKeys: index signature
    const outDir = compilerOptions["outDir"];
    // biome-ignore lint/complexity/useLiteralKeys: index signature
    const rootDir = compilerOptions["rootDir"];
    return {
      outDir: typeof outDir === "string" ? outDir : undefined,
      rootDir: typeof rootDir === "string" ? rootDir : undefined,
    };
  } catch {
    return null;
  }
};
