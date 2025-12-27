#!/usr/bin/env node

import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { loadConfigOrDetect } from "../config/configLoader.utils.js";
import { createSqliteWriter } from "../db/sqlite/createSqliteWriter.js";
import { openDatabase } from "../db/sqlite/sqliteConnection.utils.js";
import { indexProject } from "../ingestion/indexProject.js";
import {
  loadManifest,
  populateManifest,
  saveManifest,
} from "../ingestion/manifest.js";
import { syncOnStartup } from "../ingestion/syncOnStartup.js";
import { type WatchHandle, watchProject } from "../ingestion/watchProject.js";
import { startMcpServer } from "./startMcpServer.js";

/**
 * Default database path relative to project root.
 */
const DEFAULT_DB_PATH = ".ts-graph/graph.db";

/**
 * Parse command-line arguments for database path.
 *
 * @returns Database path (absolute or ':memory:')
 */
const parseArgs = (): string => {
  const args = process.argv.slice(2);

  // Look for --db flag
  const dbFlagIndex = args.indexOf("--db");
  if (dbFlagIndex !== -1 && args[dbFlagIndex + 1]) {
    const dbPath = args[dbFlagIndex + 1];
    if (dbPath === undefined) {
      throw new Error("--db flag requires a path argument");
    }
    return dbPath === ":memory:" ? dbPath : resolve(dbPath);
  }

  // Use default database path
  return resolve(DEFAULT_DB_PATH);
};

/**
 * Check if the database exists and has been initialized.
 *
 * @param dbPath - Path to the database file
 * @returns True if the database exists and is initialized
 */
const isDatabaseInitialized = (dbPath: string): boolean => {
  if (dbPath === ":memory:") {
    return false;
  }
  return existsSync(dbPath);
};

/**
 * Main entry point for the MCP server.
 * Starts the server with database connection, file watching, and optional indexing.
 */
export const main = async (): Promise<void> => {
  let watchHandle: WatchHandle | null = null;

  try {
    // Parse command-line arguments
    const dbPath = parseArgs();
    const projectRoot = process.cwd();

    console.error(`Starting ts-graph-mcp server...`);
    console.error(`Database: ${dbPath}`);
    console.error(`Project root: ${projectRoot}`);

    // Check if database exists
    const dbExists = isDatabaseInitialized(dbPath);

    // Open database connection (creates and initializes schema if new)
    const db = openDatabase({ path: dbPath });

    // Load config (always needed for watcher)
    const configResult = await loadConfigOrDetect(projectRoot);

    // If database doesn't exist, do initial indexing
    if (!dbExists) {
      console.error("Database not found. Attempting to index project...");

      if (configResult) {
        // Log how config was obtained
        if (configResult.source === "explicit") {
          console.error(`Using config: ${configResult.configPath}`);
        } else {
          console.error(
            "No config file found. Auto-detected tsconfig.json, using default configuration.",
          );
        }

        // Index the project
        const writer = createSqliteWriter(db);
        const result = await indexProject(configResult.config, writer, {
          projectRoot,
          clearFirst: false,
        });

        console.error(
          `Indexed ${result.filesProcessed} files (${result.nodesAdded} symbols, ${result.edgesAdded} connections) in ${result.durationMs}ms`,
        );

        if (result.errors && result.errors.length > 0) {
          console.error(
            `Indexing completed with ${result.errors.length} errors:`,
          );
          for (const error of result.errors) {
            console.error(`  - ${error.file}: ${error.message}`);
          }
        }

        // Create initial manifest from indexed files
        const manifest = loadManifest(dbPath);
        populateManifest(manifest, result.filesIndexed, projectRoot);
        saveManifest(dbPath, manifest);
      } else {
        console.error(
          "No config file or tsconfig.json found. Starting server with empty database.",
        );
        console.error(
          "To index your project, either create a ts-graph-mcp.config.json file or ensure tsconfig.json exists.",
        );
      }
    } else {
      // Database exists - sync with filesystem
      console.error("Using existing database. Checking for file changes...");

      if (configResult) {
        const manifest = loadManifest(dbPath);
        const syncResult = await syncOnStartup(
          db,
          configResult.config,
          manifest,
          {
            projectRoot,
            dbPath,
          },
        );

        const totalChanges =
          syncResult.staleCount +
          syncResult.deletedCount +
          syncResult.addedCount;
        if (totalChanges > 0) {
          console.error(
            `Synced ${totalChanges} file changes (${syncResult.staleCount} modified, ${syncResult.addedCount} new, ${syncResult.deletedCount} deleted) in ${syncResult.durationMs}ms`,
          );
        } else {
          console.error("Database is up to date.");
        }

        if (syncResult.errors && syncResult.errors.length > 0) {
          console.error(
            `Sync completed with ${syncResult.errors.length} errors:`,
          );
          for (const error of syncResult.errors) {
            console.error(`  - ${error.file}: ${error.message}`);
          }
        }
      }
    }

    // Start file watcher if config is available
    if (configResult) {
      const manifest = loadManifest(dbPath);
      const watchConfig = configResult.config.watch ?? {};

      watchHandle = watchProject(db, configResult.config, manifest, {
        projectRoot,
        dbPath,
        debounce: watchConfig.debounce,
        usePolling: watchConfig.usePolling,
        pollingInterval: watchConfig.pollingInterval,
        silent: watchConfig.silent,
      });

      console.error("File watcher started.");
    }

    // Set up graceful shutdown
    const shutdown = async () => {
      console.error("\nShutting down...");
      if (watchHandle) {
        await watchHandle.close();
      }
      process.exit(0);
    };

    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);

    // Start MCP server
    console.error("Starting MCP server on stdio...");
    await startMcpServer(db, projectRoot);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Fatal error: ${message}`);
    if (error instanceof Error && error.stack) {
      console.error(error.stack);
    }
    if (watchHandle) {
      await watchHandle.close();
    }
    process.exit(1);
  }
};

// Run main if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error("Unhandled error:", error);
    process.exit(1);
  });
}
