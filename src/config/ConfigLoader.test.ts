import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	CONFIG_FILE_NAMES,
	findConfigFile,
	loadConfig,
} from "./ConfigLoader.js";

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

	describe("findConfigFile", () => {
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

	describe("loadConfig", () => {
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
});
