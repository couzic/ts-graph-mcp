import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import type { ProjectConfig } from "../config/Config.schemas.js";

/**
 * Extract npm package names from configured packages.
 *
 * For each package in the config, reads its package.json to get the actual
 * npm package name. This is used to determine which packages should have
 * error logging enabled when building the workspace map.
 *
 * @example
 * const config = {
 *   packages: [
 *     { name: "core", tsconfig: "./libs/toolkit/tsconfig.json" }
 *   ]
 * };
 * extractConfiguredPackageNames(config, "/path/to/project")
 * // => Set { "@libs/toolkit" }
 */
export const extractConfiguredPackageNames = (
  config: ProjectConfig,
  projectRoot: string,
): Set<string> => {
  const result = new Set<string>();

  for (const pkg of config.packages) {
    const absoluteTsConfigPath = resolve(projectRoot, pkg.tsconfig);
    const packageDir = dirname(absoluteTsConfigPath);
    const packageJsonPath = join(packageDir, "package.json");

    if (!existsSync(packageJsonPath)) {
      continue;
    }

    try {
      const content = readFileSync(packageJsonPath, "utf-8");
      const packageJson = JSON.parse(content) as Record<string, unknown>;
      // biome-ignore lint/complexity/useLiteralKeys: index signature
      const name = packageJson["name"];
      if (typeof name === "string" && name.length > 0) {
        result.add(name);
      }
    } catch {
      // Ignore parse errors - the package just won't be in the set
    }
  }

  return result;
};
