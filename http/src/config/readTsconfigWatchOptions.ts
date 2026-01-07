import type { WatchConfig } from "./Config.schemas.js";

/**
 * TypeScript tsconfig.json watchOptions structure.
 * See: https://www.typescriptlang.org/tsconfig#watchOptions
 */
interface TsconfigWatchOptions {
  watchFile?:
    | "useFsEvents"
    | "useFsEventsOnParentDirectory"
    | "fixedPollingInterval"
    | "priorityPollingInterval"
    | "dynamicPriorityPolling"
    | "fixedChunkSizePolling";
  watchDirectory?:
    | "useFsEvents"
    | "fixedPollingInterval"
    | "dynamicPriorityPolling"
    | "fixedChunkSizePolling";
  fallbackPolling?:
    | "fixedInterval"
    | "priorityInterval"
    | "dynamicPriority"
    | "fixedChunkSize";
  pollingInterval?: number;
  synchronousWatchDirectory?: boolean;
  excludeDirectories?: string[];
  excludeFiles?: string[];
}

/**
 * Check if a watchFile strategy requires polling.
 */
const isPollingStrategy = (watchFile: string | undefined): boolean => {
  if (!watchFile) return false;
  return watchFile.toLowerCase().includes("polling");
};

/**
 * Parse tsconfig.json content and extract watchOptions mapped to our WatchConfig.
 *
 * Pure function — no I/O.
 *
 * @param content - The raw JSON content of tsconfig.json
 * @returns Partial WatchConfig with fields from tsconfig watchOptions, or empty object if none
 */
export const parseTsconfigWatchOptions = (
  content: string,
): Partial<WatchConfig> => {
  try {
    const tsconfig = JSON.parse(content) as {
      watchOptions?: TsconfigWatchOptions;
    };
    const watchOptions = tsconfig.watchOptions;

    if (!watchOptions) {
      return {};
    }

    const result: Partial<WatchConfig> = {};

    // Map watchFile polling strategies to polling: true
    if (isPollingStrategy(watchOptions.watchFile)) {
      result.polling = true;
    }

    // Direct mappings
    if (watchOptions.pollingInterval !== undefined) {
      result.pollingInterval = watchOptions.pollingInterval;
    }
    if (watchOptions.excludeDirectories !== undefined) {
      result.excludeDirectories = watchOptions.excludeDirectories;
    }
    if (watchOptions.excludeFiles !== undefined) {
      result.excludeFiles = watchOptions.excludeFiles;
    }

    return result;
  } catch {
    // Invalid JSON or malformed tsconfig — return empty
    return {};
  }
};

/**
 * Merge watch configurations with precedence:
 * explicitConfig > tsconfigOptions > defaults
 *
 * Pure function.
 *
 * @param explicitConfig - User's explicit ts-graph-mcp.config.json watch settings
 * @param tsconfigOptions - Options derived from tsconfig.json watchOptions
 * @returns Merged watch config
 */
export const mergeWatchConfigs = (
  explicitConfig: Partial<WatchConfig> | undefined,
  tsconfigOptions: Partial<WatchConfig>,
): Partial<WatchConfig> => {
  // Start with tsconfig as fallback
  const merged = { ...tsconfigOptions };

  // Overlay explicit config (wins over tsconfig)
  if (explicitConfig) {
    for (const [key, value] of Object.entries(explicitConfig)) {
      if (value !== undefined) {
        (merged as Record<string, unknown>)[key] = value;
      }
    }
  }

  return merged;
};
