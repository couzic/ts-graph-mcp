import { existsSync } from "node:fs";
import { join } from "node:path";
import { loadConfigOrDetect } from "../config/configLoader.utils.js";
import { createSqliteWriter } from "../db/sqlite/createSqliteWriter.js";
import { openDatabase } from "../db/sqlite/sqliteConnection.utils.js";
import { consoleLogger } from "../logging/ConsoleTsGraphLogger.js";
import { indexProject } from "./indexProject.js";
import { loadManifest, populateManifest, saveManifest } from "./manifest.js";
import { syncOnStartup } from "./syncOnStartup.js";

/**
 * Options for running a full index.
 */
export interface RunFullIndexOptions {
  /** Project root directory */
  projectRoot: string;
  /** Cache directory (contains graph.db, manifest.json) */
  cacheDir: string;
}

/**
 * Run a full index of the project.
 *
 * Opens the database, indexes or syncs as needed, saves manifest, closes database.
 * No server, no file watcher - just pure indexing.
 */
export const runFullIndex = async (
  options: RunFullIndexOptions,
): Promise<void> => {
  const { projectRoot, cacheDir } = options;

  console.error(`[ts-graph] Cache: ${cacheDir}`);
  console.error(`[ts-graph] Project root: ${projectRoot}`);

  const dbPath = join(cacheDir, "graph.db");
  const dbExists = existsSync(dbPath);
  const db = openDatabase({ path: dbPath });

  try {
    const configResult = loadConfigOrDetect(projectRoot);

    if (!configResult) {
      console.error(
        "[ts-graph] No config file or tsconfig.json found. Nothing to index.",
      );
      return;
    }

    if (!dbExists) {
      console.error("[ts-graph] Database not found. Indexing project...");

      if (configResult.source === "explicit") {
        console.error(
          `[ts-graph] Using config: ${configResult.configPath}`,
        );
      } else {
        console.error(
          "[ts-graph] No config file found. Auto-detected tsconfig.json.",
        );
      }

      const writer = createSqliteWriter(db);
      const result = await indexProject(configResult.config, writer, {
        projectRoot,
        clearFirst: false,
        logger: consoleLogger,
      });

      console.error(
        `[ts-graph] Indexed ${result.filesProcessed} files (${result.nodesAdded} symbols, ${result.edgesAdded} connections) in ${result.durationMs}ms`,
      );

      if (result.errors && result.errors.length > 0) {
        console.error(
          `[ts-graph] Indexing completed with ${result.errors.length} errors:`,
        );
        for (const error of result.errors) {
          console.error(`  - ${error.file}: ${error.message}`);
        }
      }

      const manifest = loadManifest(cacheDir);
      populateManifest(manifest, result.filesIndexed, projectRoot);
      saveManifest(cacheDir, manifest);
    } else {
      console.error(
        "[ts-graph] Using existing database. Checking for file changes...",
      );

      const manifest = loadManifest(cacheDir);
      const syncResult = await syncOnStartup(
        db,
        configResult.config,
        manifest,
        { projectRoot, cacheDir, logger: consoleLogger },
      );

      const totalChanges =
        syncResult.staleCount + syncResult.deletedCount + syncResult.addedCount;
      if (totalChanges > 0) {
        console.error(
          `[ts-graph] Synced ${totalChanges} file changes (${syncResult.staleCount} modified, ${syncResult.addedCount} new, ${syncResult.deletedCount} deleted) in ${syncResult.durationMs}ms`,
        );
      } else {
        console.error("[ts-graph] Database is up to date.");
      }

      if (syncResult.errors && syncResult.errors.length > 0) {
        console.error(
          `[ts-graph] Sync completed with ${syncResult.errors.length} errors:`,
        );
        for (const error of syncResult.errors) {
          console.error(`  - ${error.file}: ${error.message}`);
        }
      }
    }
  } finally {
    db.close();
  }
};
