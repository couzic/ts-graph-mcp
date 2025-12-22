import { existsSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { IMPLICIT_MODULE_NAME } from "../tools/shared/nodeFormatters.js";
import {
	normalizeConfig,
	type ProjectConfig,
	ProjectConfigInputSchema,
} from "./ConfigSchema.js";

/**
 * Read package name from package.json in the given directory.
 *
 * Falls back to directory name if package.json is missing or has no name.
 * Throws if package.json exists but is malformed JSON.
 *
 * @param directory - Directory containing package.json
 * @returns Package name from package.json, or directory name as fallback
 * @throws Error if package.json exists but contains invalid JSON
 */
export const readPackageName = (directory: string): string => {
	const packageJsonPath = join(directory, "package.json");
	const directoryName = basename(directory);

	if (!existsSync(packageJsonPath)) {
		return directoryName;
	}

	const content = readFileSync(packageJsonPath, "utf-8");
	let pkg: unknown;
	try {
		pkg = JSON.parse(content);
	} catch {
		throw new Error(
			`Failed to parse package.json in ${directory}: invalid JSON`,
		);
	}

	const name =
		pkg !== null &&
		typeof pkg === "object" &&
		"name" in pkg &&
		typeof pkg.name === "string" &&
		pkg.name.length > 0
			? pkg.name
			: directoryName;

	return name;
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
 * @param packageName - Package name (from package.json or IMPLICIT_PACKAGE_NAME)
 * @returns Default ProjectConfig
 */
export const createDefaultConfig = (
	tsconfigPath: string,
	packageName: string,
): ProjectConfig => ({
	modules: [
		{
			name: IMPLICIT_MODULE_NAME,
			packages: [{ name: packageName, tsconfig: tsconfigPath }],
		},
	],
});

/**
 * Supported config file names in order of precedence.
 */
export const CONFIG_FILE_NAMES = [
	"ts-graph-mcp.config.ts",
	"ts-graph-mcp.config.js",
	"ts-graph-mcp.config.json",
] as const;

/**
 * Find a config file in the given directory.
 *
 * @param directory - Directory to search in
 * @returns Path to config file, or null if not found
 */
export const findConfigFile = (directory: string): string | null => {
	for (const name of CONFIG_FILE_NAMES) {
		const configPath = join(directory, name);
		if (existsSync(configPath)) {
			return configPath;
		}
	}
	return null;
};

/**
 * Load and validate a config file.
 *
 * @param configPath - Path to config file
 * @returns Validated project config
 * @throws Error if file cannot be loaded or config is invalid
 */
export const loadConfig = async (
	configPath: string,
): Promise<ProjectConfig> => {
	if (!existsSync(configPath)) {
		throw new Error(`Config file not found: ${configPath}`);
	}

	const ext = configPath.split(".").pop();

	let rawConfig: unknown;

	if (ext === "json") {
		const content = readFileSync(configPath, "utf-8");
		try {
			rawConfig = JSON.parse(content);
		} catch (_e) {
			throw new Error(`Failed to parse JSON config: ${configPath}`);
		}
	} else if (ext === "ts" || ext === "js") {
		// For TypeScript/JavaScript configs, we need to dynamically import
		// The config file should export a default config object
		try {
			const module = await import(configPath);
			rawConfig = module.default ?? module;
		} catch (e) {
			throw new Error(
				`Failed to load config: ${configPath} - ${(e as Error).message}`,
			);
		}
	} else {
		throw new Error(`Unsupported config file extension: ${ext}`);
	}

	// Validate with Zod schema (accepts both full and flat formats)
	const parsed = ProjectConfigInputSchema.parse(rawConfig);
	// Normalize flat format to full format
	return normalizeConfig(parsed);
};

/**
 * Load config from a directory, auto-detecting the config file.
 *
 * @param directory - Directory to search for config
 * @returns Validated project config
 * @throws Error if no config file found or config is invalid
 */
export const loadConfigFromDirectory = async (
	directory: string,
): Promise<ProjectConfig> => {
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
 * 1. Explicit config file (ts-graph-mcp.config.ts/js/json)
 * 2. Auto-detect tsconfig.json and generate default config
 * 3. Return null if neither found
 *
 * @param directory - Directory to search for config
 * @returns Config with source info, or null if no config possible
 */
export const loadConfigOrDetect = async (
	directory: string,
): Promise<ConfigResult | null> => {
	// 1. Try explicit config file first
	const configPath = findConfigFile(directory);
	if (configPath) {
		const config = await loadConfig(configPath);
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
