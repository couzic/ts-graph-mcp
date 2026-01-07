import type Database from "better-sqlite3";
import express from "express";
import { existsSync } from "node:fs";
import { join } from "node:path";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getCacheDir } from "./config/getCacheDir.js";
import { loadConfigOrDetect } from "./config/configLoader.utils.js";
import { createSqliteWriter } from "./db/sqlite/createSqliteWriter.js";
import { openDatabase } from "./db/sqlite/sqliteConnection.utils.js";
import { indexProject } from "./ingestion/indexProject.js";
import { loadManifest, populateManifest, saveManifest } from "./ingestion/manifest.js";
import { syncOnStartup } from "./ingestion/syncOnStartup.js";
import { dependenciesOf } from "./query/dependencies-of/dependenciesOf.js";
import { dependentsOf } from "./query/dependents-of/dependentsOf.js";
import { pathsBetween } from "./query/paths-between/pathsBetween.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Index the project and return the open database connection.
 * Unlike runFullIndex, this keeps the DB open for use by the HTTP server.
 */
const indexAndOpenDb = async (
  projectRoot: string,
  cacheDir: string,
  forceReindex: boolean,
): Promise<{ db: Database.Database; indexedFiles: number }> => {
  console.error(`[ts-graph] Cache: ${cacheDir}`);
  console.error(`[ts-graph] Project root: ${projectRoot}`);

  const dbPath = join(cacheDir, "graph.db");
  const dbExists = existsSync(dbPath);
  const db = openDatabase({ path: dbPath });

  const configResult = loadConfigOrDetect(projectRoot);

  if (!configResult) {
    console.error(
      "[ts-graph] No config file or tsconfig.json found. Nothing to index.",
    );
    return { db, indexedFiles: 0 };
  }

  if (forceReindex || !dbExists) {
    if (forceReindex) {
      console.error("[ts-graph] Force reindex requested. Clearing database...");
    } else {
      console.error("[ts-graph] Database not found. Indexing project...");
    }

    if (configResult.source === "explicit") {
      console.error(`[ts-graph] Using config: ${configResult.configPath}`);
    } else {
      console.error(
        "[ts-graph] No config file found. Auto-detected tsconfig.json.",
      );
    }

    const writer = createSqliteWriter(db);
    const result = await indexProject(configResult.config, writer, {
      projectRoot,
      clearFirst: forceReindex,
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

    return { db, indexedFiles: result.filesProcessed };
  }

  console.error(
    "[ts-graph] Using existing database. Checking for file changes...",
  );

  const manifest = loadManifest(cacheDir);
  const syncResult = await syncOnStartup(
    db,
    configResult.config,
    manifest,
    { projectRoot, cacheDir },
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

  // Get actual file count from database
  const countResult = db
    .prepare<[], { count: number }>("SELECT COUNT(DISTINCT file_path) as count FROM nodes")
    .get();
  const indexedFiles = countResult?.count ?? 0;

  return { db, indexedFiles };
};

/**
 * Starts the HTTP server with REST API and static UI.
 *
 * @example
 * ```bash
 * npx ts-graph           # Start server
 * npx ts-graph --reindex # Force clean reindex
 * ```
 */
export const startHttpServer = async (args: string[]) => {
  const shouldReindex = args.includes("--reindex");
  const projectRoot = process.cwd();
  const cacheDir = getCacheDir(projectRoot);

  // Index project and keep DB open
  const { db, indexedFiles } = await indexAndOpenDb(
    projectRoot,
    cacheDir,
    shouldReindex,
  );

  // Track indexed files count (updated after sync)
  let currentIndexedFiles = indexedFiles;

  const app = express();

  // Serve static UI files (UI builds to dist/public, server is at dist/http/src)
  const publicDir = path.resolve(__dirname, "../../public");
  app.use(express.static(publicDir));

  // Health check
  app.get("/health", (_req, res) => {
    res.json({
      status: "ok",
      ready: true,
      indexed_files: currentIndexedFiles,
    });
  });

  // API routes
  app.get("/api/symbols", (req, res) => {
    const query = req.query["q"] as string | undefined;
    if (!query || query.length < 1) {
      res.json([]);
      return;
    }

    // Search symbols by name (case-insensitive prefix match)
    const results = db
      .prepare<[string], { file_path: string; symbol: string; type: string }>(
        `SELECT file_path, name as symbol, type FROM nodes
         WHERE name LIKE ? || '%' COLLATE NOCASE
         AND type != 'File'
         ORDER BY name
         LIMIT 50`,
      )
      .all(query);

    res.json(results);
  });

  app.get("/api/graph/dependencies", (req, res) => {
    const filePath = req.query["file"] as string | undefined;
    const symbol = req.query["symbol"] as string | undefined;

    if (!filePath || !symbol) {
      res.status(400).send("Missing required parameters: file, symbol");
      return;
    }

    const result = dependenciesOf(db, projectRoot, filePath, symbol);
    res.type("text/plain").send(result);
  });

  app.get("/api/graph/dependents", (req, res) => {
    const filePath = req.query["file"] as string | undefined;
    const symbol = req.query["symbol"] as string | undefined;

    if (!filePath || !symbol) {
      res.status(400).send("Missing required parameters: file, symbol");
      return;
    }

    const result = dependentsOf(db, projectRoot, filePath, symbol);
    res.type("text/plain").send(result);
  });

  app.get("/api/graph/paths", (req, res) => {
    const fromFile = req.query["from_file"] as string | undefined;
    const fromSymbol = req.query["from_symbol"] as string | undefined;
    const toFile = req.query["to_file"] as string | undefined;
    const toSymbol = req.query["to_symbol"] as string | undefined;

    if (!fromFile || !fromSymbol || !toFile || !toSymbol) {
      res
        .status(400)
        .send(
          "Missing required parameters: from_file, from_symbol, to_file, to_symbol",
        );
      return;
    }

    const result = pathsBetween(
      db,
      projectRoot,
      { file_path: fromFile, symbol: fromSymbol },
      { file_path: toFile, symbol: toSymbol },
    );
    res.type("text/plain").send(result);
  });

  // SPA fallback - serve index.html for all other routes
  app.get("/{*path}", (_req, res) => {
    res.sendFile(path.join(publicDir, "index.html"));
  });

  // Load port from config (required)
  const configResult = loadConfigOrDetect(projectRoot);
  const port = configResult?.config.server?.port;
  if (!port) {
    console.error(
      "[ts-graph] Error: No port configured. Add server.port to ts-graph-mcp.config.json",
    );
    process.exit(1);
  }

  app.listen(port, () => {
    console.log(`ts-graph server running at http://localhost:${port}`);
    console.log("Press CTRL+C to stop");
  });

  // Handle graceful shutdown
  process.on("SIGINT", () => {
    console.log("\nShutting down...");
    db.close();
    process.exit(0);
  });

  process.on("SIGTERM", () => {
    db.close();
    process.exit(0);
  });
};
