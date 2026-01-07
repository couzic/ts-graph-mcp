import { existsSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { type ProjectConfig, ProjectConfigSchema } from "./Config.schemas.js";

/**
 * Read package name from package.json in the given directory.
 * Falls back to directory name if package.json missing or has no name.
 */
export const readPackageName = (directory: string): string => {
  const packageJsonPath = join(directory, "package.json");
  const directoryName = basename(directory);

  if (!existsSync(packageJsonPath)) {
    return directoryName;
  }

  const pkg = JSON.parse(readFileSync(packageJsonPath, "utf-8"));
  return typeof pkg.name === "string" && pkg.name.length > 0
    ? pkg.name
    : directoryName;
};

/**
 * Detect tsconfig.json in the given directory.
 *
 * @param directory - Directory to check
 * @returns Relative path to tsconfig.json or null if not found
 */
export const detectTsconfig = (directory: string): string | null => {
  const tsconfigPath = join(directory, "tsconfig.json");
  return existsSync(tsconfigPath) ? "./tsconfig.json" : null;
};

/**
 * Create a default ProjectConfig with sensible defaults.
 *
 * @param tsconfigPath - Relative path to tsconfig.json
 * @param packageName - Package name (from package.json or directory name)
 * @returns Default ProjectConfig
 */
export const createDefaultConfig = (
  tsconfigPath: string,
  packageName: string,
): ProjectConfig => ({
  packages: [{ name: packageName, tsconfig: tsconfigPath }],
});

/**
 * Supported config file name.
 *
 * JSON-only for reliability — Node.js cannot dynamically import TypeScript
 * files without a loader (tsx/ts-node), which would break when users run
 * the compiled package via `npx ts-graph`.
 */
export const CONFIG_FILE_NAME = "ts-graph-mcp.config.json" as const;

/**
 * Find a config file in the given directory.
 *
 * @param directory - Directory to search in
 * @returns Path to config file, or null if not found
 */
export const findConfigFile = (directory: string): string | null => {
  const configPath = join(directory, CONFIG_FILE_NAME);
  return existsSync(configPath) ? configPath : null;
};

/**
 * Parse and validate config content.
 * Pure function - unit tested.
 *
 * @param content - Raw JSON string from config file
 * @returns Validated project config
 * @throws Error if JSON is invalid or config structure is invalid
 */
export const parseConfig = (content: string): ProjectConfig => {
  let rawConfig: unknown;
  try {
    rawConfig = JSON.parse(content);
  } catch {
    throw new Error("Invalid JSON");
  }

  return ProjectConfigSchema.parse(rawConfig);
};

/**
 * Load and validate a JSON config file.
 * Thin I/O wrapper around parseConfig.
 */
export const loadConfig = (configPath: string): ProjectConfig => {
  if (!existsSync(configPath)) {
    throw new Error(`Config file not found: ${configPath}`);
  }

  try {
    const content = readFileSync(configPath, "utf-8");
    return parseConfig(content);
  } catch (e) {
    if (e instanceof Error && e.message === "Invalid JSON") {
      throw new Error(`Failed to parse JSON config: ${configPath}`);
    }
    throw e;
  }
};

/**
 * Load config from a directory, auto-detecting the config file.
 *
 * @param directory - Directory to search for config
 * @returns Validated project config
 * @throws Error if no config file found or config is invalid
 */
export const loadConfigFromDirectory = (directory: string): ProjectConfig => {
  const configPath = findConfigFile(directory);
  if (!configPath) {
    throw new Error(`No config file found in: ${directory}`);
  }
  return loadConfig(configPath);
};

/**
 * Result type for loadConfigOrDetect indicating how config was obtained.
 */
export type ConfigResult = {
  config: ProjectConfig;
  source: "explicit" | "auto-detected";
  configPath?: string;
};

/**
 * Load config from explicit file or auto-detect from tsconfig.json.
 *
 * Priority:
 * 1. Explicit config file (ts-graph.config.json)
 * 2. Auto-detect tsconfig.json and generate default config
 * 3. Return null if neither found
 *
 * @param directory - Directory to search for config
 * @returns Config with source info, or null if no config possible
 */
export const loadConfigOrDetect = (directory: string): ConfigResult | null => {
  // 1. Try explicit config file first
  const configPath = findConfigFile(directory);
  if (configPath) {
    const config = loadConfig(configPath);
    return { config, source: "explicit", configPath };
  }

  // 2. Try auto-detect tsconfig.json
  const tsconfigPath = detectTsconfig(directory);
  if (tsconfigPath) {
    const packageName = readPackageName(directory);
    const config = createDefaultConfig(tsconfigPath, packageName);
    return { config, source: "auto-detected" };
  }

  // 3. No config possible
  return null;
};
