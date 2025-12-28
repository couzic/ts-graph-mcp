import { mkdirSync } from "node:fs";
import { join } from "node:path";
import findCacheDir from "find-cache-dir";

/**
 * Default fallback path when node_modules/.cache is not available.
 */
const FALLBACK_DIR = ".ts-graph";

/**
 * Get the cache directory for ts-graph-mcp.
 *
 * Uses the de facto standard `node_modules/.cache/ts-graph-mcp/` location
 * when available. Falls back to `.ts-graph/` if node_modules doesn't exist
 * (e.g., in test fixtures or non-npm projects).
 *
 * @param projectRoot - The project root directory (used as cwd for find-cache-dir)
 * @returns Absolute path to the cache directory
 */
export const getCacheDir = (projectRoot: string): string => {
  // find-cache-dir searches upward from cwd for package.json
  // and returns node_modules/.cache/<name> if found
  const cacheDir = findCacheDir({ name: "ts-graph-mcp", cwd: projectRoot });

  if (cacheDir) {
    // Ensure the directory exists
    mkdirSync(cacheDir, { recursive: true });
    return cacheDir;
  }

  // Fallback: .ts-graph/ in project root
  const fallbackDir = join(projectRoot, FALLBACK_DIR);
  mkdirSync(fallbackDir, { recursive: true });
  return fallbackDir;
};

/**
 * Get the default database path for a project.
 *
 * @param projectRoot - The project root directory
 * @returns Absolute path to graph.db
 */
export const getDefaultDbPath = (projectRoot: string): string => {
  return join(getCacheDir(projectRoot), "graph.db");
};
