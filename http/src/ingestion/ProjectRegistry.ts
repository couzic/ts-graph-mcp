import { dirname, resolve } from "node:path";
import type { Project } from "ts-morph";
import type { ProjectConfig } from "../config/Config.schemas.js";
import { createProject } from "./createProject.js";
import { extractConfiguredPackageNames } from "./extractConfiguredPackageNames.js";
import { normalizePath } from "./normalizePath.js";
import { toPathPrefix } from "./toPathPrefix.js";

/**
 * Registry that maps file paths to their owning ts-morph Project.
 *
 * Used for cross-package resolution when a barrel file uses path aliases
 * that need to be resolved with a different tsconfig context.
 *
 * @example
 * // When indexing frontend/App.ts and following re-exports in libs/ui/src/index.ts,
 * // the path alias "@/components/*" needs libs/ui's tsconfig, not frontend's.
 * const project = registry.getProjectForFile("/abs/path/to/libs/ui/src/index.ts");
 */
export interface ProjectRegistry {
  /**
   * Get the Project instance that owns a given file path.
   * @param absolutePath - Absolute path to the file
   * @returns The owning Project, or undefined if not in any registered package
   */
  getProjectForFile(absolutePath: string): Project | undefined;

  /**
   * Get the Project instance for a given tsconfig path.
   * @param absoluteTsConfigPath - Absolute path to tsconfig.json
   */
  getProjectForTsConfig(absoluteTsConfigPath: string): Project | undefined;
}

interface PackageEntry {
  /** Absolute path prefix for this package (e.g., "/home/user/project/libs/ui/") */
  pathPrefix: string;
  /** ts-morph Project for this package */
  project: Project;
}

/**
 * Create a ProjectRegistry from project configuration.
 *
 * Creates all ts-morph Projects upfront and builds a lookup structure
 * to find the correct Project for any file path.
 *
 * @param config - Project configuration with packages
 * @param projectRoot - Absolute path to project root
 * @returns ProjectRegistry instance
 */
export const createProjectRegistry = (
  config: ProjectConfig,
  projectRoot: string,
): ProjectRegistry => {
  const entries: PackageEntry[] = [];
  const projectsByTsConfig = new Map<string, Project>();
  const configuredPackageNames = extractConfiguredPackageNames(
    config,
    projectRoot,
  );

  for (const pkg of config.packages) {
    const absoluteTsConfigPath = resolve(projectRoot, pkg.tsconfig);
    const packageRoot = dirname(absoluteTsConfigPath);

    const project = createProject({
      tsConfigFilePath: absoluteTsConfigPath,
      workspaceRoot: projectRoot,
      configuredPackageNames,
    });

    entries.push({
      pathPrefix: toPathPrefix(packageRoot),
      project,
    });
    projectsByTsConfig.set(absoluteTsConfigPath, project);
  }

  // Sort by path length descending so more specific paths match first
  // e.g., "/project/libs/ui/src/" matches before "/project/libs/"
  entries.sort((a, b) => b.pathPrefix.length - a.pathPrefix.length);

  return {
    getProjectForFile(absolutePath: string): Project | undefined {
      const normalizedPath = normalizePath(absolutePath);
      for (const entry of entries) {
        if (normalizedPath.startsWith(entry.pathPrefix)) {
          return entry.project;
        }
      }
      return undefined;
    },

    getProjectForTsConfig(absoluteTsConfigPath: string): Project | undefined {
      return projectsByTsConfig.get(absoluteTsConfigPath);
    },
  };
};
