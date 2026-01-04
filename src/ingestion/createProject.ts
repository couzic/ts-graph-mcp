import { dirname, isAbsolute, resolve } from "node:path";
import { Project, ts } from "ts-morph";
import { buildWorkspaceMap } from "./buildWorkspaceMap.js";

/**
 * Options for creating a ts-morph Project.
 */
export interface CreateProjectOptions {
  tsConfigFilePath: string;
  /**
   * Root directory of the workspace (where root package.json with workspaces field lives).
   * If not provided, auto-detected by walking up from tsconfig location.
   */
  workspaceRoot?: string;
  /**
   * Set of npm package names that are configured in ts-graph-mcp.config.json.
   * When a configured package is imported but not in the workspace map,
   * an error is logged once per package.
   */
  configuredPackageNames?: Set<string>;
}

/**
 * Create a ts-morph Project with workspace-aware module resolution.
 *
 * When a workspace root is detected (package.json with "workspaces" field),
 * module resolution will check workspace packages before falling back to
 * standard TypeScript resolution. This allows cross-package imports to
 * resolve directly to source files without requiring compiled artifacts.
 *
 * @example
 * // Single package (no workspace)
 * const project = createProject({ tsConfigFilePath: './tsconfig.json' });
 *
 * @example
 * // Monorepo with explicit workspace root
 * const project = createProject({
 *   tsConfigFilePath: './packages/app/tsconfig.json',
 *   workspaceRoot: '/path/to/monorepo'
 * });
 */
export const createProject = (options: CreateProjectOptions): Project => {
  const { tsConfigFilePath, workspaceRoot, configuredPackageNames } = options;

  const absoluteTsConfigPath = isAbsolute(tsConfigFilePath)
    ? tsConfigFilePath
    : resolve(tsConfigFilePath);
  const projectDir = dirname(absoluteTsConfigPath);

  // Determine workspace root: explicit, or fall back to project dir
  const effectiveWorkspaceRoot = workspaceRoot ?? projectDir;
  const workspaceMap = buildWorkspaceMap(effectiveWorkspaceRoot);

  // Track packages we've already warned about (log once per package)
  const warnedPackages = new Set<string>();

  // If no workspace packages found, use standard resolution
  if (workspaceMap.size === 0) {
    return new Project({ tsConfigFilePath: absoluteTsConfigPath });
  }

  // Workspace resolution: use custom resolutionHost
  return new Project({
    tsConfigFilePath: absoluteTsConfigPath,
    resolutionHost: (moduleResolutionHost, getCompilerOptions) => ({
      resolveModuleNames: (
        moduleNames: string[],
        containingFile: string,
      ): (ts.ResolvedModule | undefined)[] => {
        const compilerOptions = getCompilerOptions();

        return moduleNames.map((moduleName) => {
          // Check workspace map first (e.g., "@libs/toolkit" -> "/path/to/libs/toolkit/src/index.ts")
          const sourceEntry = workspaceMap.get(moduleName);
          if (sourceEntry) {
            return {
              resolvedFileName: sourceEntry,
              isExternalLibraryImport: false,
            };
          }

          // Log error if this is a configured package we couldn't resolve
          if (
            configuredPackageNames?.has(moduleName) &&
            !warnedPackages.has(moduleName)
          ) {
            warnedPackages.add(moduleName);
            console.error(
              `[ts-graph-mcp] Cannot resolve workspace package "${moduleName}": source entry not found. Cross-package edges will be missing.`,
            );
          }

          // Fall back to standard TypeScript resolution
          const result = ts.resolveModuleName(
            moduleName,
            containingFile,
            compilerOptions,
            moduleResolutionHost,
          );
          return result.resolvedModule;
        });
      },
    }),
  });
};
