import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type Database from "better-sqlite3";
import type { ProjectConfig } from "../config/Config.schemas.js";
import { loadConfigOrDetect } from "../config/configLoader.utils.js";
import {
  mergeWatchConfigs,
  parseTsconfigWatchOptions,
} from "../config/readTsconfigWatchOptions.js";
import { createSqliteWriter } from "../db/sqlite/createSqliteWriter.js";
import { openDatabase } from "../db/sqlite/sqliteConnection.utils.js";
import { indexProject } from "../ingestion/indexProject.js";
import {
  type IndexManifest,
  loadManifest,
  populateManifest,
  saveManifest,
} from "../ingestion/manifest.js";
import { syncOnStartup } from "../ingestion/syncOnStartup.js";
import { type WatchHandle, watchProject } from "../ingestion/watchProject.js";

/**
 * Result of initializing the server core.
 */
export interface ServerCoreResult {
  /** Database connection */
  db: Database.Database;
  /** Project configuration (if found) */
  config: ProjectConfig | null;
  /** Index manifest */
  manifest: IndexManifest | null;
  /** File watcher handle (if started) */
  watchHandle: WatchHandle | null;
}

/**
 * Options for initializing the server core.
 */
export interface ServerCoreOptions {
  /** Project root directory */
  projectRoot: string;
  /** Cache directory (contains graph.db, manifest.json, server.json) */
  cacheDir: string;
}

/**
 * Initialize the server core: database, indexing, sync, and file watcher.
 * This is shared logic used by both stdio and HTTP server modes.
 */
export const initializeServerCore = async (
  options: ServerCoreOptions,
): Promise<ServerCoreResult> => {
  const { projectRoot, cacheDir } = options;

  console.error(`[ts-graph-mcp] Starting server...`);
  console.error(`[ts-graph-mcp] Cache: ${cacheDir}`);
  console.error(`[ts-graph-mcp] Project root: ${projectRoot}`);

  // Database file is in the cache directory
  const dbPath = join(cacheDir, "graph.db");

  // Check if database exists
  const dbExists = existsSync(dbPath);

  // Open database connection (creates and initializes schema if new)
  const db = openDatabase({ path: dbPath });

  // Load config (always needed for watcher)
  const configResult = loadConfigOrDetect(projectRoot);
  let config: ProjectConfig | null = null;
  let manifest: IndexManifest | null = null;
  let watchHandle: WatchHandle | null = null;

  if (configResult) {
    config = configResult.config;

    // If database doesn't exist, do initial indexing
    if (!dbExists) {
      console.error("[ts-graph-mcp] Database not found. Indexing project...");

      if (configResult.source === "explicit") {
        console.error(
          `[ts-graph-mcp] Using config: ${configResult.configPath}`,
        );
      } else {
        console.error(
          "[ts-graph-mcp] No config file found. Auto-detected tsconfig.json.",
        );
      }

      // Index the project
      const writer = createSqliteWriter(db);
      const result = await indexProject(configResult.config, writer, {
        projectRoot,
        clearFirst: false,
      });

      console.error(
        `[ts-graph-mcp] Indexed ${result.filesProcessed} files (${result.nodesAdded} symbols, ${result.edgesAdded} connections) in ${result.durationMs}ms`,
      );

      if (result.errors && result.errors.length > 0) {
        console.error(
          `[ts-graph-mcp] Indexing completed with ${result.errors.length} errors:`,
        );
        for (const error of result.errors) {
          console.error(`  - ${error.file}: ${error.message}`);
        }
      }

      // Create initial manifest from indexed files
      manifest = loadManifest(cacheDir);
      populateManifest(manifest, result.filesIndexed, projectRoot);
      saveManifest(cacheDir, manifest);
    } else {
      // Database exists - sync with filesystem
      console.error(
        "[ts-graph-mcp] Using existing database. Checking for file changes...",
      );

      manifest = loadManifest(cacheDir);
      const syncResult = await syncOnStartup(
        db,
        configResult.config,
        manifest,
        {
          projectRoot,
          cacheDir,
        },
      );

      const totalChanges =
        syncResult.staleCount + syncResult.deletedCount + syncResult.addedCount;
      if (totalChanges > 0) {
        console.error(
          `[ts-graph-mcp] Synced ${totalChanges} file changes (${syncResult.staleCount} modified, ${syncResult.addedCount} new, ${syncResult.deletedCount} deleted) in ${syncResult.durationMs}ms`,
        );
      } else {
        console.error("[ts-graph-mcp] Database is up to date.");
      }

      if (syncResult.errors && syncResult.errors.length > 0) {
        console.error(
          `[ts-graph-mcp] Sync completed with ${syncResult.errors.length} errors:`,
        );
        for (const error of syncResult.errors) {
          console.error(`  - ${error.file}: ${error.message}`);
        }
      }
    }

    // Start file watcher
    manifest = manifest || loadManifest(cacheDir);

    // Read tsconfig watchOptions as fallback (explicit config wins)
    const tsconfigPath = join(projectRoot, "tsconfig.json");
    const tsconfigWatchOptions = existsSync(tsconfigPath)
      ? parseTsconfigWatchOptions(readFileSync(tsconfigPath, "utf-8"))
      : {};

    const mergedWatchConfig = mergeWatchConfigs(
      configResult.config.watch,
      tsconfigWatchOptions,
    );

    watchHandle = watchProject(db, configResult.config, manifest, {
      projectRoot,
      cacheDir,
      ...mergedWatchConfig,
    });

    console.error("[ts-graph-mcp] File watcher started.");
  } else {
    console.error(
      "[ts-graph-mcp] No config file or tsconfig.json found. Starting with empty database.",
    );
  }

  return { db, config, manifest, watchHandle };
};
