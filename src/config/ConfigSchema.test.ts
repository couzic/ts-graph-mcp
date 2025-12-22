import { describe, expect, it } from "vitest";
import {
	defineConfig,
	ModuleConfigSchema,
	normalizeConfig,
	PackageConfigSchema,
	ProjectConfigInputSchema,
	ProjectConfigSchema,
	StorageConfigSchema,
	WatchConfigSchema,
} from "./ConfigSchema.js";

describe("ConfigSchema", () => {
	describe("PackageConfigSchema", () => {
		it("validates valid package config", () => {
			const config = {
				name: "core",
				tsconfig: "./packages/core/tsconfig.json",
			};
			const result = PackageConfigSchema.parse(config);
			expect(result).toEqual(config);
		});

		it("rejects empty name", () => {
			expect(() =>
				PackageConfigSchema.parse({ name: "", tsconfig: "./tsconfig.json" }),
			).toThrow();
		});

		it("rejects empty tsconfig", () => {
			expect(() =>
				PackageConfigSchema.parse({ name: "core", tsconfig: "" }),
			).toThrow();
		});
	});

	describe("ModuleConfigSchema", () => {
		it("validates module with single package", () => {
			const config = {
				name: "api",
				packages: [
					{ name: "rest", tsconfig: "./packages/api/rest/tsconfig.json" },
				],
			};
			const result = ModuleConfigSchema.parse(config);
			expect(result.name).toBe("api");
			expect(result.packages).toHaveLength(1);
		});

		it("validates module with multiple packages", () => {
			const config = {
				name: "api",
				packages: [
					{ name: "rest", tsconfig: "./packages/api/rest/tsconfig.json" },
					{ name: "graphql", tsconfig: "./packages/api/graphql/tsconfig.json" },
				],
			};
			const result = ModuleConfigSchema.parse(config);
			expect(result.packages).toHaveLength(2);
		});

		it("rejects empty packages array", () => {
			expect(() =>
				ModuleConfigSchema.parse({ name: "api", packages: [] }),
			).toThrow();
		});
	});

	describe("StorageConfigSchema", () => {
		it("validates sqlite storage with path", () => {
			const config = { type: "sqlite" as const, path: "./data/graph.db" };
			const result = StorageConfigSchema.parse(config);
			expect(result.type).toBe("sqlite");
			if (result.type === "sqlite") {
				expect(result.path).toBe("./data/graph.db");
			}
		});

		it("validates sqlite storage without path (optional)", () => {
			const config = { type: "sqlite" as const };
			const result = StorageConfigSchema.parse(config);
			expect(result.type).toBe("sqlite");
		});

		it("validates memgraph storage with all options", () => {
			const config = {
				type: "memgraph" as const,
				host: "192.168.1.100",
				port: 7688,
				username: "admin",
				password: "secret",
			};
			const result = StorageConfigSchema.parse(config);
			expect(result.type).toBe("memgraph");
			if (result.type === "memgraph") {
				expect(result.host).toBe("192.168.1.100");
				expect(result.port).toBe(7688);
			}
		});

		it("validates memgraph storage with defaults", () => {
			const config = { type: "memgraph" as const };
			const result = StorageConfigSchema.parse(config);
			expect(result.type).toBe("memgraph");
		});

		it("rejects invalid storage type", () => {
			expect(() => StorageConfigSchema.parse({ type: "postgres" })).toThrow();
		});

		it("rejects negative port", () => {
			expect(() =>
				StorageConfigSchema.parse({ type: "memgraph", port: -1 }),
			).toThrow();
		});
	});

	describe("WatchConfigSchema", () => {
		it("validates watch config with all options", () => {
			const config = {
				include: ["**/*.ts", "**/*.tsx"],
				exclude: ["**/node_modules/**"],
				debounce: 200,
			};
			const result = WatchConfigSchema.parse(config);
			expect(result.include).toEqual(["**/*.ts", "**/*.tsx"]);
			expect(result.debounce).toBe(200);
		});

		it("validates empty watch config (all optional)", () => {
			const result = WatchConfigSchema.parse({});
			expect(result).toEqual({});
		});

		it("rejects negative debounce", () => {
			expect(() => WatchConfigSchema.parse({ debounce: -100 })).toThrow();
		});
	});

	describe("ProjectConfigSchema", () => {
		it("validates minimal project config", () => {
			const config = {
				modules: [
					{
						name: "core",
						packages: [{ name: "main", tsconfig: "./tsconfig.json" }],
					},
				],
			};
			const result = ProjectConfigSchema.parse(config);
			expect(result.modules).toHaveLength(1);
			expect(result.storage).toBeUndefined();
			expect(result.watch).toBeUndefined();
		});

		it("validates full project config", () => {
			const config = {
				modules: [
					{
						name: "api",
						packages: [
							{ name: "rest", tsconfig: "./packages/api/rest/tsconfig.json" },
						],
					},
					{
						name: "core",
						packages: [
							{
								name: "domain",
								tsconfig: "./packages/core/domain/tsconfig.json",
							},
							{
								name: "utils",
								tsconfig: "./packages/core/utils/tsconfig.json",
							},
						],
					},
				],
				storage: {
					type: "sqlite" as const,
					path: ".ts-graph-mcp/graph.db",
				},
				watch: {
					include: ["**/*.ts", "**/*.tsx"],
					exclude: ["**/node_modules/**", "**/dist/**"],
					debounce: 100,
				},
			};
			const result = ProjectConfigSchema.parse(config);
			expect(result.modules).toHaveLength(2);
			expect(result.storage?.type).toBe("sqlite");
			expect(result.watch?.debounce).toBe(100);
		});

		it("rejects empty modules array", () => {
			expect(() => ProjectConfigSchema.parse({ modules: [] })).toThrow();
		});
	});

	describe(defineConfig.name, () => {
		it("returns validated config", () => {
			const config = {
				modules: [
					{
						name: "app",
						packages: [{ name: "main", tsconfig: "./tsconfig.json" }],
					},
				],
			};
			const result = defineConfig(config);
			expect(result).toEqual(config);
		});

		it("throws on invalid config", () => {
			expect(() =>
				defineConfig({ modules: [] } as unknown as Parameters<
					typeof defineConfig
				>[0]),
			).toThrow();
		});

		it("accepts flat packages format and normalizes to full format", () => {
			const flatConfig = {
				packages: [
					{ name: "core", tsconfig: "./tsconfig.json" },
					{ name: "utils", tsconfig: "./packages/utils/tsconfig.json" },
				],
			};
			const result = defineConfig(flatConfig);
			expect(result.modules).toHaveLength(1);
			expect(result.modules[0]?.name).toBe("main");
			expect(result.modules[0]?.packages).toEqual(flatConfig.packages);
		});

		it("preserves storage and watch options in flat format", () => {
			const flatConfig = {
				packages: [{ name: "core", tsconfig: "./tsconfig.json" }],
				storage: { type: "sqlite" as const, path: "./data/graph.db" },
				watch: { debounce: 200 },
			};
			const result = defineConfig(flatConfig);
			expect(result.storage).toEqual(flatConfig.storage);
			expect(result.watch).toEqual(flatConfig.watch);
		});
	});

	describe("ProjectConfigInputSchema", () => {
		it("accepts full format with modules", () => {
			const config = {
				modules: [
					{
						name: "app",
						packages: [{ name: "main", tsconfig: "./tsconfig.json" }],
					},
				],
			};
			const result = ProjectConfigInputSchema.parse(config);
			expect("modules" in result).toBe(true);
		});

		it("accepts flat format with packages", () => {
			const config = {
				packages: [{ name: "core", tsconfig: "./tsconfig.json" }],
			};
			const result = ProjectConfigInputSchema.parse(config);
			expect("packages" in result).toBe(true);
		});

		it("rejects config with neither modules nor packages", () => {
			expect(() => ProjectConfigInputSchema.parse({})).toThrow();
		});

		it("rejects config with empty packages array", () => {
			expect(() => ProjectConfigInputSchema.parse({ packages: [] })).toThrow();
		});
	});

	describe(normalizeConfig.name, () => {
		it("passes through full format unchanged", () => {
			const fullConfig = {
				modules: [
					{
						name: "app",
						packages: [{ name: "main", tsconfig: "./tsconfig.json" }],
					},
				],
			};
			const result = normalizeConfig(fullConfig);
			expect(result).toEqual(fullConfig);
		});

		it("converts flat format to full format with implicit main module", () => {
			const flatConfig = {
				packages: [
					{ name: "core", tsconfig: "./tsconfig.json" },
					{ name: "utils", tsconfig: "./packages/utils/tsconfig.json" },
				],
			};
			const result = normalizeConfig(flatConfig);
			expect(result.modules).toHaveLength(1);
			expect(result.modules[0]?.name).toBe("main");
			expect(result.modules[0]?.packages).toEqual(flatConfig.packages);
		});

		it("preserves optional fields when normalizing", () => {
			const flatConfig = {
				packages: [{ name: "core", tsconfig: "./tsconfig.json" }],
				storage: { type: "sqlite" as const },
				watch: { debounce: 100 },
			};
			const result = normalizeConfig(flatConfig);
			expect(result.storage).toEqual({ type: "sqlite" });
			expect(result.watch).toEqual({ debounce: 100 });
		});
	});
});
