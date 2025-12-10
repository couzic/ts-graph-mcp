import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { type ProjectConfig, ProjectConfigSchema } from "./ConfigSchema.js";

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

	// Validate with Zod schema
	return ProjectConfigSchema.parse(rawConfig);
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
