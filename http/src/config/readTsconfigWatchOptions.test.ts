import { describe, expect, it } from "vitest";
import {
  mergeWatchConfigs,
  parseTsconfigWatchOptions,
} from "./readTsconfigWatchOptions.js";

describe(parseTsconfigWatchOptions.name, () => {
  it("returns empty object for tsconfig without watchOptions", () => {
    const content = JSON.stringify({
      compilerOptions: { target: "ES2022" },
    });
    expect(parseTsconfigWatchOptions(content)).toEqual({});
  });

  it("returns empty object for empty watchOptions", () => {
    const content = JSON.stringify({
      watchOptions: {},
    });
    expect(parseTsconfigWatchOptions(content)).toEqual({});
  });

  it("maps fixedPollingInterval to polling: true", () => {
    const content = JSON.stringify({
      watchOptions: { watchFile: "fixedPollingInterval" },
    });
    expect(parseTsconfigWatchOptions(content)).toEqual({ polling: true });
  });

  it("maps priorityPollingInterval to polling: true", () => {
    const content = JSON.stringify({
      watchOptions: { watchFile: "priorityPollingInterval" },
    });
    expect(parseTsconfigWatchOptions(content)).toEqual({ polling: true });
  });

  it("maps dynamicPriorityPolling to polling: true", () => {
    const content = JSON.stringify({
      watchOptions: { watchFile: "dynamicPriorityPolling" },
    });
    expect(parseTsconfigWatchOptions(content)).toEqual({ polling: true });
  });

  it("maps fixedChunkSizePolling to polling: true", () => {
    const content = JSON.stringify({
      watchOptions: { watchFile: "fixedChunkSizePolling" },
    });
    expect(parseTsconfigWatchOptions(content)).toEqual({ polling: true });
  });

  it("does not set polling for useFsEvents", () => {
    const content = JSON.stringify({
      watchOptions: { watchFile: "useFsEvents" },
    });
    expect(parseTsconfigWatchOptions(content)).toEqual({});
  });

  it("maps pollingInterval directly", () => {
    const content = JSON.stringify({
      watchOptions: { pollingInterval: 500 },
    });
    expect(parseTsconfigWatchOptions(content)).toEqual({
      pollingInterval: 500,
    });
  });

  it("maps excludeDirectories directly", () => {
    const content = JSON.stringify({
      watchOptions: { excludeDirectories: ["**/node_modules", "dist"] },
    });
    expect(parseTsconfigWatchOptions(content)).toEqual({
      excludeDirectories: ["**/node_modules", "dist"],
    });
  });

  it("maps excludeFiles directly", () => {
    const content = JSON.stringify({
      watchOptions: { excludeFiles: ["temp.ts", "*.generated.ts"] },
    });
    expect(parseTsconfigWatchOptions(content)).toEqual({
      excludeFiles: ["temp.ts", "*.generated.ts"],
    });
  });

  it("combines multiple watchOptions fields", () => {
    const content = JSON.stringify({
      watchOptions: {
        watchFile: "fixedPollingInterval",
        pollingInterval: 1000,
        excludeDirectories: ["dist"],
        excludeFiles: ["temp.ts"],
      },
    });
    expect(parseTsconfigWatchOptions(content)).toEqual({
      polling: true,
      pollingInterval: 1000,
      excludeDirectories: ["dist"],
      excludeFiles: ["temp.ts"],
    });
  });

  it("returns empty object for invalid JSON", () => {
    expect(parseTsconfigWatchOptions("not valid json")).toEqual({});
  });

  it("ignores unmapped fields (watchDirectory, fallbackPolling, synchronousWatchDirectory)", () => {
    const content = JSON.stringify({
      watchOptions: {
        watchDirectory: "fixedPollingInterval",
        fallbackPolling: "dynamicPriority",
        synchronousWatchDirectory: true,
      },
    });
    // These don't map to our simpler model
    expect(parseTsconfigWatchOptions(content)).toEqual({});
  });
});

describe(mergeWatchConfigs.name, () => {
  it("returns tsconfig options when no explicit config", () => {
    const tsconfigOptions = { polling: true, pollingInterval: 500 };
    expect(mergeWatchConfigs(undefined, tsconfigOptions)).toEqual(
      tsconfigOptions,
    );
  });

  it("returns empty object when both are empty/undefined", () => {
    expect(mergeWatchConfigs(undefined, {})).toEqual({});
  });

  it("explicit config overrides tsconfig options", () => {
    const explicit = { polling: false, silent: true };
    const tsconfig = { polling: true, pollingInterval: 500 };
    expect(mergeWatchConfigs(explicit, tsconfig)).toEqual({
      polling: false, // explicit wins
      pollingInterval: 500, // from tsconfig
      silent: true, // from explicit
    });
  });

  it("explicit config adds fields not in tsconfig", () => {
    const explicit = { debounce: true, debounceInterval: 100 };
    const tsconfig = { excludeDirectories: ["dist"] };
    expect(mergeWatchConfigs(explicit, tsconfig)).toEqual({
      debounce: true,
      debounceInterval: 100,
      excludeDirectories: ["dist"],
    });
  });

  it("undefined values in explicit config do not override tsconfig", () => {
    const explicit = { polling: undefined, silent: true };
    const tsconfig = { polling: true };
    expect(mergeWatchConfigs(explicit, tsconfig)).toEqual({
      polling: true, // tsconfig preserved (explicit was undefined)
      silent: true,
    });
  });
});
