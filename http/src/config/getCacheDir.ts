import { mkdirSync } from "node:fs";
import { join } from "node:path";

/**
 * Cache directory name in project root.
 */
const CACHE_DIR = ".ts-graph-mcp";

/**
 * Get the cache directory for ts-graph.
 *
 * Uses `.ts-graph-mcp/` in the project root. This is more predictable than
 * `node_modules/.cache/` because it doesn't search upward for package.json,
 * avoiding issues with nested projects using the parent's cache.
 *
 * @param projectRoot - The project root directory
 * @returns Absolute path to the cache directory
 */
export const getCacheDir = (projectRoot: string): string => {
  const cacheDir = join(projectRoot, CACHE_DIR);
  mkdirSync(cacheDir, { recursive: true });
  return cacheDir;
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
