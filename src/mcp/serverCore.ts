import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type Database from "better-sqlite3";
import {
  type ConfigResult,
  loadConfigOrDetect,
} from "../config/configLoader.utils.js";
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
 * Result of quick server core initialization.
 */
export interface QuickStartResult {
  /** Database connection */
  db: Database.Database;
  /** Project configuration with source info (if found) */
  configResult: ConfigResult | null;
  /** Whether database already existed (no initial indexing needed) */
  dbExists: boolean;
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
 * Quick initialization: open DB and load config only.
 * Does not perform indexing. Use this when you want to start serving immediately.
 */
export const initializeServerCoreQuick = (
  options: ServerCoreOptions,
): QuickStartResult => {
  const { projectRoot, cacheDir } = options;

  console.error(`[ts-graph-mcp] Starting server...`);
  console.error(`[ts-graph-mcp] Cache: ${cacheDir}`);
  console.error(`[ts-graph-mcp] Project root: ${projectRoot}`);

  const dbPath = join(cacheDir, "graph.db");
  const dbExists = existsSync(dbPath);
  const db = openDatabase({ path: dbPath });
  const configResult = loadConfigOrDetect(projectRoot);

  return {
    db,
    configResult,
    dbExists,
  };
};

/**
 * Callback for when indexing completes.
 */
export type OnIndexingComplete = () => void;

/**
 * Run indexing and start file watcher.
 * Call this after quick init to perform the slow indexing work.
 */
export const runIndexingAndWatch = async (
  options: ServerCoreOptions & {
    db: Database.Database;
    configResult: ConfigResult;
    dbExists: boolean;
    onComplete?: OnIndexingComplete;
  },
): Promise<{ manifest: IndexManifest; watchHandle: WatchHandle }> => {
  const { projectRoot, cacheDir, db, configResult, dbExists, onComplete } =
    options;
  const { config, source, configPath } = configResult;
  let manifest: IndexManifest;

  if (!dbExists) {
    console.error("[ts-graph-mcp] Database not found. Indexing project...");

    if (source === "explicit") {
      console.error(`[ts-graph-mcp] Using config: ${configPath}`);
    } else {
      console.error(
        "[ts-graph-mcp] No config file found. Auto-detected tsconfig.json.",
      );
    }

    const writer = createSqliteWriter(db);
    const result = await indexProject(config, writer, {
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

    manifest = loadManifest(cacheDir);
    populateManifest(manifest, result.filesIndexed, projectRoot);
    saveManifest(cacheDir, manifest);
  } else {
    console.error(
      "[ts-graph-mcp] Using existing database. Checking for file changes...",
    );

    manifest = loadManifest(cacheDir);
    const syncResult = await syncOnStartup(db, config, manifest, {
      projectRoot,
      cacheDir,
    });

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
  const tsconfigPath = join(projectRoot, "tsconfig.json");
  const tsconfigWatchOptions = existsSync(tsconfigPath)
    ? parseTsconfigWatchOptions(readFileSync(tsconfigPath, "utf-8"))
    : {};

  const mergedWatchConfig = mergeWatchConfigs(
    config.watch,
    tsconfigWatchOptions,
  );

  const watchHandle = watchProject(db, config, manifest, {
    projectRoot,
    cacheDir,
    ...mergedWatchConfig,
  });

  console.error("[ts-graph-mcp] File watcher started.");

  if (onComplete) {
    onComplete();
  }

  return { manifest, watchHandle };
};
