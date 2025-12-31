import { describe, expect, it } from "vitest";
import {
  PackageConfigSchema,
  ProjectConfigSchema,
  StorageConfigSchema,
  WatchConfigSchema,
} from "./Config.schemas.js";
import { defineConfig } from "./defineConfig.js";

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
    it("validates polling config with all options", () => {
      const config = {
        polling: true,
        pollingInterval: 500,
        excludeDirectories: ["dist", "node_modules"],
        excludeFiles: ["*.generated.ts"],
        silent: true,
      };
      const result = WatchConfigSchema.parse(config);
      expect(result.polling).toBe(true);
      expect(result.pollingInterval).toBe(500);
      expect(result.excludeDirectories).toEqual(["dist", "node_modules"]);
      expect(result.excludeFiles).toEqual(["*.generated.ts"]);
      expect(result.silent).toBe(true);
    });

    it("validates debounce config with all options", () => {
      const config = {
        debounce: true,
        debounceInterval: 200,
        excludeDirectories: ["dist"],
        excludeFiles: ["*.generated.ts"],
        silent: true,
      };
      const result = WatchConfigSchema.parse(config);
      expect(result.debounce).toBe(true);
      expect(result.debounceInterval).toBe(200);
      expect(result.excludeDirectories).toEqual(["dist"]);
      expect(result.excludeFiles).toEqual(["*.generated.ts"]);
      expect(result.silent).toBe(true);
    });

    it("validates empty watch config (all optional)", () => {
      const result = WatchConfigSchema.parse({});
      expect(result).toEqual({});
    });

    it("rejects negative debounce", () => {
      expect(() => WatchConfigSchema.parse({ debounce: -100 })).toThrow();
    });

    it("rejects polling with debounce enabled (mutually exclusive)", () => {
      expect(() =>
        WatchConfigSchema.parse({ polling: true, debounce: true }),
      ).toThrow(/mutually exclusive|cannot.*both/i);
    });
  });

  describe("ProjectConfigSchema", () => {
    it("validates minimal project config", () => {
      const config = {
        packages: [{ name: "main", tsconfig: "./tsconfig.json" }],
      };
      const result = ProjectConfigSchema.parse(config);
      expect(result.packages).toHaveLength(1);
      expect(result.storage).toBeUndefined();
      expect(result.watch).toBeUndefined();
    });

    it("validates full project config", () => {
      const config = {
        packages: [
          { name: "rest", tsconfig: "./packages/api/rest/tsconfig.json" },
          { name: "domain", tsconfig: "./packages/core/domain/tsconfig.json" },
          { name: "utils", tsconfig: "./packages/core/utils/tsconfig.json" },
        ],
        storage: {
          type: "sqlite" as const,
          path: ".ts-graph-mcp/graph.db",
        },
        watch: {
          excludeDirectories: ["node_modules", "dist"],
          debounce: true,
          debounceInterval: 100,
        },
      };
      const result = ProjectConfigSchema.parse(config);
      expect(result.packages).toHaveLength(3);
      expect(result.storage?.type).toBe("sqlite");
      expect(result.watch?.debounce).toBe(true);
      expect(result.watch?.debounceInterval).toBe(100);
    });

    it("rejects empty packages array", () => {
      expect(() => ProjectConfigSchema.parse({ packages: [] })).toThrow();
    });
  });

  describe(defineConfig.name, () => {
    it("returns validated config", () => {
      const config = {
        packages: [{ name: "main", tsconfig: "./tsconfig.json" }],
      };
      const result = defineConfig(config);
      expect(result).toEqual(config);
    });

    it("throws on invalid config", () => {
      expect(() =>
        defineConfig({ packages: [] } as unknown as Parameters<
          typeof defineConfig
        >[0]),
      ).toThrow();
    });

    it("preserves storage and watch options", () => {
      const config = {
        packages: [{ name: "core", tsconfig: "./tsconfig.json" }],
        storage: { type: "sqlite" as const, path: "./data/graph.db" },
        watch: { debounce: true, debounceInterval: 200 },
      };
      const result = defineConfig(config);
      expect(result.storage).toEqual(config.storage);
      expect(result.watch).toEqual(config.watch);
    });
  });
});
