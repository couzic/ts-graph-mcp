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
 * Get the SQLite directory path.
 *
 * @param cacheDir - The cache directory
 * @returns Absolute path to .ts-graph-mcp/sqlite/
 */
export const getSqliteDir = (cacheDir: string): string => {
  const sqliteDir = join(cacheDir, "sqlite");
  mkdirSync(sqliteDir, { recursive: true });
  return sqliteDir;
};

/**
 * Get the Orama directory path.
 *
 * @param cacheDir - The cache directory
 * @returns Absolute path to .ts-graph-mcp/orama/
 */
export const getOramaDir = (cacheDir: string): string => {
  const oramaDir = join(cacheDir, "orama");
  mkdirSync(oramaDir, { recursive: true });
  return oramaDir;
};

/**
 * Get the default database path for a project.
 *
 * @param projectRoot - The project root directory
 * @returns Absolute path to .ts-graph-mcp/sqlite/graph.db
 */
export const getDefaultDbPath = (projectRoot: string): string => {
  const cacheDir = getCacheDir(projectRoot);
  return join(getSqliteDir(cacheDir), "graph.db");
};

/**
 * Get the default Orama index path for a project.
 *
 * @param cacheDir - The cache directory
 * @returns Absolute path to .ts-graph-mcp/orama/index.json
 */
export const getOramaIndexPath = (cacheDir: string): string => {
  return join(getOramaDir(cacheDir), "index.json");
};
