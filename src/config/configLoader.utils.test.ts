import { describe, expect, it } from "vitest";
import {
  CONFIG_FILE_NAME,
  createDefaultConfig,
  IMPLICIT_MODULE_NAME,
  parseConfig,
} from "./configLoader.utils.js";

describe("configLoader.utils", () => {
  describe("CONFIG_FILE_NAME", () => {
    it("is ts-graph-mcp.config.json", () => {
      expect(CONFIG_FILE_NAME).toBe("ts-graph-mcp.config.json");
    });
  });

  describe(parseConfig.name, () => {
    it("parses valid full-format config", () => {
      const config = {
        modules: [
          {
            name: "core",
            packages: [{ name: "main", tsconfig: "./tsconfig.json" }],
          },
        ],
      };

      const result = parseConfig(JSON.stringify(config));

      expect(result.modules).toHaveLength(1);
      expect(result.modules[0]?.name).toBe("core");
    });

    it("parses config with storage and watch settings", () => {
      const config = {
        modules: [
          {
            name: "api",
            packages: [{ name: "rest", tsconfig: "./tsconfig.json" }],
          },
        ],
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

    it("throws on invalid config structure (empty modules)", () => {
      expect(() => parseConfig(JSON.stringify({ modules: [] }))).toThrow();
    });

    it("throws on missing required fields", () => {
      expect(() => parseConfig(JSON.stringify({}))).toThrow();
    });
  });

  describe(createDefaultConfig.name, () => {
    it("creates config with implicit module name", () => {
      const result = createDefaultConfig("./tsconfig.json", "my-project");

      expect(result.modules).toHaveLength(1);
      expect(result.modules[0]?.name).toBe(IMPLICIT_MODULE_NAME);
      expect(result.modules[0]?.packages).toHaveLength(1);
      expect(result.modules[0]?.packages[0]?.name).toBe("my-project");
      expect(result.modules[0]?.packages[0]?.tsconfig).toBe("./tsconfig.json");
    });
  });
});
