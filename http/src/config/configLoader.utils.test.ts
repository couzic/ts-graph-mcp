import { describe, expect, it } from "vitest";
import {
  CONFIG_FILE_NAME,
  createDefaultConfig,
  parseConfig,
} from "./configLoader.utils.js";

describe("configLoader.utils", () => {
  describe("CONFIG_FILE_NAME", () => {
    it("is ts-graph-mcp.config.json", () => {
      expect(CONFIG_FILE_NAME).toBe("ts-graph-mcp.config.json");
    });
  });

  describe(parseConfig.name, () => {
    it("parses valid config", () => {
      const config = {
        packages: [{ name: "main", tsconfig: "./tsconfig.json" }],
      };

      const result = parseConfig(JSON.stringify(config));

      expect(result.packages).toHaveLength(1);
      expect(result.packages[0]?.name).toBe("main");
    });

    it("parses config with storage and watch settings", () => {
      const config = {
        packages: [{ name: "rest", tsconfig: "./tsconfig.json" }],
        storage: { type: "sqlite", path: "./data/graph.db" },
        watch: { debounce: true, debounceInterval: 150 },
      };

      const result = parseConfig(JSON.stringify(config));

      expect(result.storage?.type).toBe("sqlite");
      expect(result.watch?.debounce).toBe(true);
      expect(result.watch?.debounceInterval).toBe(150);
    });

    it("throws on invalid JSON", () => {
      expect(() => parseConfig("{ invalid }")).toThrow("Invalid JSON");
    });

    it("throws on invalid config structure (empty packages)", () => {
      expect(() => parseConfig(JSON.stringify({ packages: [] }))).toThrow();
    });

    it("throws on missing required fields", () => {
      expect(() => parseConfig(JSON.stringify({}))).toThrow();
    });
  });

  describe(createDefaultConfig.name, () => {
    it("creates config with package name", () => {
      const result = createDefaultConfig("./tsconfig.json", "my-project");

      expect(result.packages).toHaveLength(1);
      expect(result.packages[0]?.name).toBe("my-project");
      expect(result.packages[0]?.tsconfig).toBe("./tsconfig.json");
    });
  });
});
