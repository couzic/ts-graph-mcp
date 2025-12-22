import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { IMPLICIT_MODULE_NAME } from "../tools/shared/nodeFormatters.js";
import {
	CONFIG_FILE_NAMES,
	createDefaultConfig,
	detectTsconfig,
	findConfigFile,
	loadConfig,
	loadConfigOrDetect,
	readPackageName,
} from "./configLoader.utils.js";

const TEST_DIR = "/tmp/ts-graph-rag-config-test";

describe("ConfigLoader", () => {
	beforeEach(() => {
		if (existsSync(TEST_DIR)) {
			rmSync(TEST_DIR, { recursive: true });
		}
		mkdirSync(TEST_DIR, { recursive: true });
	});

	afterEach(() => {
		if (existsSync(TEST_DIR)) {
			rmSync(TEST_DIR, { recursive: true });
		}
	});

	describe("CONFIG_FILE_NAMES", () => {
		it("includes expected config file names", () => {
			expect(CONFIG_FILE_NAMES).toContain("ts-graph-mcp.config.ts");
			expect(CONFIG_FILE_NAMES).toContain("ts-graph-mcp.config.js");
			expect(CONFIG_FILE_NAMES).toContain("ts-graph-mcp.config.json");
		});
	});

	describe(findConfigFile.name, () => {
		it("finds ts-graph-mcp.config.json", () => {
			const configPath = join(TEST_DIR, "ts-graph-mcp.config.json");
			writeFileSync(configPath, "{}");

			const result = findConfigFile(TEST_DIR);
			expect(result).toBe(configPath);
		});

		it("returns null when no config file exists", () => {
			const result = findConfigFile(TEST_DIR);
			expect(result).toBeNull();
		});

		it("prefers .ts over .js over .json", () => {
			// Create all three
			writeFileSync(join(TEST_DIR, "ts-graph-mcp.config.json"), "{}");
			writeFileSync(
				join(TEST_DIR, "ts-graph-mcp.config.js"),
				"module.exports = {}",
			);
			writeFileSync(
				join(TEST_DIR, "ts-graph-mcp.config.ts"),
				"export default {}",
			);

			const result = findConfigFile(TEST_DIR);
			expect(result).toBe(join(TEST_DIR, "ts-graph-mcp.config.ts"));
		});
	});

	describe(loadConfig.name, () => {
		it("loads valid JSON config", async () => {
			const config = {
				modules: [
					{
						name: "core",
						packages: [{ name: "main", tsconfig: "./tsconfig.json" }],
					},
				],
			};
			const configPath = join(TEST_DIR, "ts-graph-mcp.config.json");
			writeFileSync(configPath, JSON.stringify(config));

			const result = await loadConfig(configPath);
			expect(result.modules).toHaveLength(1);
			expect(result.modules[0]?.name).toBe("core");
		});

		it("loads config with storage and watch settings", async () => {
			const config = {
				modules: [
					{
						name: "api",
						packages: [
							{ name: "rest", tsconfig: "./packages/api/tsconfig.json" },
						],
					},
				],
				storage: {
					type: "sqlite",
					path: "./data/graph.db",
				},
				watch: {
					include: ["**/*.ts"],
					exclude: ["**/node_modules/**"],
					debounce: 150,
				},
			};
			const configPath = join(TEST_DIR, "ts-graph-mcp.config.json");
			writeFileSync(configPath, JSON.stringify(config));

			const result = await loadConfig(configPath);
			expect(result.storage?.type).toBe("sqlite");
			expect(result.watch?.debounce).toBe(150);
		});

		it("throws on invalid JSON", async () => {
			const configPath = join(TEST_DIR, "ts-graph-mcp.config.json");
			writeFileSync(configPath, "{ invalid json }");

			await expect(loadConfig(configPath)).rejects.toThrow();
		});

		it("throws on invalid config structure", async () => {
			const configPath = join(TEST_DIR, "ts-graph-mcp.config.json");
			writeFileSync(configPath, JSON.stringify({ modules: [] })); // Empty modules array

			await expect(loadConfig(configPath)).rejects.toThrow();
		});

		it("throws when file does not exist", async () => {
			const configPath = join(TEST_DIR, "nonexistent.json");
			await expect(loadConfig(configPath)).rejects.toThrow();
		});
	});

	describe(readPackageName.name, () => {
		it("returns name from valid package.json", () => {
			const packageJson = { name: "my-awesome-project", version: "1.0.0" };
			writeFileSync(
				join(TEST_DIR, "package.json"),
				JSON.stringify(packageJson),
			);

			const result = readPackageName(TEST_DIR);
			expect(result).toBe("my-awesome-project");
		});

		it("returns directory name if package.json missing", () => {
			const result = readPackageName(TEST_DIR);
			expect(result).toBe(basename(TEST_DIR));
		});

		it("returns directory name if package.json has no name field", () => {
			writeFileSync(
				join(TEST_DIR, "package.json"),
				JSON.stringify({ version: "1.0.0" }),
			);

			const result = readPackageName(TEST_DIR);
			expect(result).toBe(basename(TEST_DIR));
		});

		it("returns directory name if package.json has empty name", () => {
			writeFileSync(
				join(TEST_DIR, "package.json"),
				JSON.stringify({ name: "", version: "1.0.0" }),
			);

			const result = readPackageName(TEST_DIR);
			expect(result).toBe(basename(TEST_DIR));
		});

		it("throws if package.json is malformed JSON", () => {
			writeFileSync(join(TEST_DIR, "package.json"), "{ invalid json }");

			expect(() => readPackageName(TEST_DIR)).toThrow(
				/Failed to parse package.json/,
			);
		});
	});

	describe(detectTsconfig.name, () => {
		it("returns path when tsconfig.json exists", () => {
			writeFileSync(join(TEST_DIR, "tsconfig.json"), "{}");

			const result = detectTsconfig(TEST_DIR);
			expect(result).toBe("./tsconfig.json");
		});

		it("returns null when tsconfig.json does not exist", () => {
			const result = detectTsconfig(TEST_DIR);
			expect(result).toBeNull();
		});
	});

	describe(createDefaultConfig.name, () => {
		it("creates config with correct structure", () => {
			const result = createDefaultConfig("./tsconfig.json", "my-project");

			expect(result.modules).toHaveLength(1);
			expect(result.modules[0]?.name).toBe(IMPLICIT_MODULE_NAME);
			expect(result.modules[0]?.packages).toHaveLength(1);
			expect(result.modules[0]?.packages[0]?.name).toBe("my-project");
			expect(result.modules[0]?.packages[0]?.tsconfig).toBe("./tsconfig.json");
		});

		it("uses IMPLICIT_MODULE_NAME regardless of package name", () => {
			const result = createDefaultConfig("./tsconfig.json", "custom-name");

			expect(result.modules[0]?.name).toBe(IMPLICIT_MODULE_NAME);
			expect(result.modules[0]?.packages[0]?.name).toBe("custom-name");
		});
	});

	describe(loadConfigOrDetect.name, () => {
		it("returns explicit config when config file exists", async () => {
			const config = {
				modules: [
					{
						name: "core",
						packages: [{ name: "main", tsconfig: "./tsconfig.json" }],
					},
				],
			};
			const configPath = join(TEST_DIR, "ts-graph-mcp.config.json");
			writeFileSync(configPath, JSON.stringify(config));

			const result = await loadConfigOrDetect(TEST_DIR);

			expect(result).not.toBeNull();
			expect(result?.source).toBe("explicit");
			expect(result?.configPath).toBe(configPath);
			expect(result?.config.modules[0]?.name).toBe("core");
		});

		it("returns auto-detected config when only tsconfig.json exists", async () => {
			writeFileSync(join(TEST_DIR, "tsconfig.json"), "{}");
			writeFileSync(
				join(TEST_DIR, "package.json"),
				JSON.stringify({ name: "auto-project" }),
			);

			const result = await loadConfigOrDetect(TEST_DIR);

			expect(result).not.toBeNull();
			expect(result?.source).toBe("auto-detected");
			expect(result?.configPath).toBeUndefined();
			expect(result?.config.modules[0]?.name).toBe(IMPLICIT_MODULE_NAME);
			expect(result?.config.modules[0]?.packages[0]?.name).toBe("auto-project");
		});

		it("prefers explicit config over auto-detection", async () => {
			// Create both config file and tsconfig.json
			const config = {
				modules: [
					{
						name: "explicit",
						packages: [{ name: "pkg", tsconfig: "./tsconfig.json" }],
					},
				],
			};
			writeFileSync(
				join(TEST_DIR, "ts-graph-mcp.config.json"),
				JSON.stringify(config),
			);
			writeFileSync(join(TEST_DIR, "tsconfig.json"), "{}");

			const result = await loadConfigOrDetect(TEST_DIR);

			expect(result?.source).toBe("explicit");
			expect(result?.config.modules[0]?.name).toBe("explicit");
		});

		it("returns null when neither config nor tsconfig.json exists", async () => {
			const result = await loadConfigOrDetect(TEST_DIR);
			expect(result).toBeNull();
		});

		it("uses directory name when package.json is missing", async () => {
			writeFileSync(join(TEST_DIR, "tsconfig.json"), "{}");
			// No package.json

			const result = await loadConfigOrDetect(TEST_DIR);

			expect(result?.config.modules[0]?.packages[0]?.name).toBe(
				basename(TEST_DIR),
			);
		});
	});
});
