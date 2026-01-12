import type { OutputFormat } from "@ts-graph/shared";
import type Database from "better-sqlite3";
import express from "express";
import { existsSync } from "node:fs";
import { join } from "node:path";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { ProjectConfig } from "./config/Config.schemas.js";
import { getCacheDir } from "./config/getCacheDir.js";
import { loadConfigOrDetect } from "./config/configLoader.utils.js";
import { createSqliteWriter } from "./db/sqlite/createSqliteWriter.js";
import { openDatabase } from "./db/sqlite/sqliteConnection.utils.js";
import { indexProject } from "./ingestion/indexProject.js";
import { type IndexManifest, loadManifest, populateManifest, saveManifest } from "./ingestion/manifest.js";
import { syncOnStartup } from "./ingestion/syncOnStartup.js";
import { type WatchHandle, watchProject } from "./ingestion/watchProject.js";
import { type Logger, consoleLogger } from "./logger.js";
import { dependenciesOf } from "./query/dependencies-of/dependenciesOf.js";
import { dependentsOf } from "./query/dependents-of/dependentsOf.js";
import { pathsBetween } from "./query/paths-between/pathsBetween.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Parse max_nodes query parameter.
 * Returns undefined if not provided or invalid.
 */
const parseMaxNodes = (value: unknown): number | undefined => {
  if (typeof value !== "string") {
    return undefined;
  }
  const parsed = parseInt(value, 10);
  if (isNaN(parsed) || parsed <= 0) {
    return undefined;
  }
  return parsed;
};

/**
 * Parse output format query parameter.
 * Returns undefined for invalid values (defaults to MCP format in query functions).
 */
const parseOutputFormat = (value: unknown): OutputFormat | undefined => {
  if (typeof value !== "string") {
    return undefined;
  }
  if (value === "mcp" || value === "mermaid" || value === "md") {
    return value;
  }
  return undefined;
};

/**
 * Index the project and return the open database connection.
 */
const indexAndOpenDb = async (
  projectRoot: string,
  cacheDir: string,
  forceReindex: boolean,
  logger: Logger,
): Promise<{
  db: Database.Database;
  indexedFiles: number;
  manifest: IndexManifest;
  config: ProjectConfig | null;
}> => {
  logger.error(`[ts-graph] Cache: ${cacheDir}`);
  logger.error(`[ts-graph] Project root: ${projectRoot}`);
  const dbPath = join(cacheDir, "graph.db");
  const dbExists = existsSync(dbPath);
  const db = openDatabase({ path: dbPath });

  const configResult = loadConfigOrDetect(projectRoot);

  if (!configResult) {
    logger.error("[ts-graph] No config file or tsconfig.json found. Nothing to index.");
    return { db, indexedFiles: 0, manifest: { version: 1, files: {} }, config: null };
  }

  if (forceReindex || !dbExists) {
    if (forceReindex) {
      logger.error("[ts-graph] Force reindex requested. Clearing database...");
    } else {
      logger.error("[ts-graph] Database not found. Indexing project...");
    }

    if (configResult.source === "explicit") {
      logger.error(`[ts-graph] Using config: ${configResult.configPath}`);
    } else {
      logger.error("[ts-graph] No config file found. Auto-detected tsconfig.json.");
    }

    const writer = createSqliteWriter(db);
    const result = await indexProject(configResult.config, writer, {
      projectRoot,
      clearFirst: forceReindex,
    });

    logger.error(
      `[ts-graph] Indexed ${result.filesProcessed} files (${result.nodesAdded} symbols, ${result.edgesAdded} connections) in ${result.durationMs}ms`,
    );

    if (result.errors && result.errors.length > 0) {
      logger.error(`[ts-graph] Indexing completed with ${result.errors.length} errors:`);
      for (const error of result.errors) {
        logger.error(`  - ${error.file}: ${error.message}`);
      }
    }

    const manifest = loadManifest(cacheDir);
    populateManifest(manifest, result.filesIndexed, projectRoot);
    saveManifest(cacheDir, manifest);

    return { db, indexedFiles: result.filesProcessed, manifest, config: configResult.config };
  }

  logger.error("[ts-graph] Using existing database. Checking for file changes...");

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
    logger.error(
      `[ts-graph] Synced ${totalChanges} file changes (${syncResult.staleCount} modified, ${syncResult.addedCount} new, ${syncResult.deletedCount} deleted) in ${syncResult.durationMs}ms`,
    );
  } else {
    logger.error("[ts-graph] Database is up to date.");
  }

  if (syncResult.errors && syncResult.errors.length > 0) {
    logger.error(`[ts-graph] Sync completed with ${syncResult.errors.length} errors:`);
    for (const error of syncResult.errors) {
      logger.error(`  - ${error.file}: ${error.message}`);
    }
  }

  // Get actual file count from database
  const countResult = db
    .prepare<[], { count: number }>("SELECT COUNT(DISTINCT file_path) as count FROM nodes")
    .get();
  const indexedFiles = countResult?.count ?? 0;

  return { db, indexedFiles, manifest, config: configResult.config };
};

/**
 * Handle returned by startHttpServer for testing and graceful shutdown.
 */
export interface ServerHandle {
  /** Close the server and release resources */
  close(): Promise<void>;
  /** The port the server is listening on */
  port: number;
}

/**
 * Options for startHttpServer.
 */
export interface ServerOptions {
  /** Logger for server output (default: consoleLogger) */
  logger?: Logger;
}

/**
 * Starts the HTTP server with REST API and static UI.
 *
 * @example
 * ```bash
 * npx ts-graph           # Start server
 * npx ts-graph --reindex # Force clean reindex
 * ```
 */
export const startHttpServer = async (
  args: string[],
  options: ServerOptions = {},
): Promise<ServerHandle> => {
  const logger = options.logger ?? consoleLogger;
  const shouldReindex = args.includes("--reindex");
  const projectRoot = process.cwd();
  const cacheDir = getCacheDir(projectRoot);

  // Index project and keep DB open
  const { db, indexedFiles, manifest, config } = await indexAndOpenDb(
    projectRoot,
    cacheDir,
    shouldReindex,
    logger,
  );

  // Track indexed files count (updated after sync)
  let currentIndexedFiles = indexedFiles;

  // Start file watcher if we have a valid config
  let watchHandle: WatchHandle | null = null;
  if (config) {
    watchHandle = watchProject(db, config, manifest, {
      projectRoot,
      cacheDir,
      silent: true, // Watcher uses its own silent flag, derived from config.watch
      ...config.watch,
    });
    await watchHandle.ready;
  }

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

    // Search symbols by name OR symbol path (case-insensitive prefix match)
    // This allows finding methods by class name (e.g., "User" finds "User.getSituations")
    const results = db
      .prepare<[string, string], { file_path: string; symbol: string; type: string }>(
        `SELECT file_path,
                SUBSTR(id, INSTR(id, ':') + 1) as symbol,
                type
         FROM nodes
         WHERE (name LIKE ? || '%' COLLATE NOCASE
                OR SUBSTR(id, INSTR(id, ':') + 1) LIKE ? || '%' COLLATE NOCASE)
         AND type != 'File'
         ORDER BY name
         LIMIT 50`,
      )
      .all(query, query);

    res.json(results);
  });

  app.get("/api/graph/dependencies", (req, res) => {
    const filePath = req.query["file"] as string | undefined;
    const symbol = req.query["symbol"] as string | undefined;
    const maxNodes = parseMaxNodes(req.query["max_nodes"]);
    const format = parseOutputFormat(req.query["output"]);

    if (!symbol) {
      res.status(400).send("Missing required parameter: symbol");
      return;
    }

    const result = dependenciesOf(db, projectRoot, filePath, symbol, { maxNodes, format });
    res.type("text/plain").send(result);
  });

  app.get("/api/graph/dependents", (req, res) => {
    const filePath = req.query["file"] as string | undefined;
    const symbol = req.query["symbol"] as string | undefined;
    const maxNodes = parseMaxNodes(req.query["max_nodes"]);
    const format = parseOutputFormat(req.query["output"]);

    if (!symbol) {
      res.status(400).send("Missing required parameter: symbol");
      return;
    }

    const result = dependentsOf(db, projectRoot, filePath, symbol, { maxNodes, format });
    res.type("text/plain").send(result);
  });

  app.get("/api/graph/paths", (req, res) => {
    const fromFile = req.query["from_file"] as string | undefined;
    const fromSymbol = req.query["from_symbol"] as string | undefined;
    const toFile = req.query["to_file"] as string | undefined;
    const toSymbol = req.query["to_symbol"] as string | undefined;
    const maxNodes = parseMaxNodes(req.query["max_nodes"]);
    const format = parseOutputFormat(req.query["output"]);

    if (!fromSymbol || !toSymbol) {
      res.status(400).send("Missing required parameters: from_symbol, to_symbol");
      return;
    }

    const result = pathsBetween(
      db,
      projectRoot,
      { file_path: fromFile, symbol: fromSymbol },
      { file_path: toFile, symbol: toSymbol },
      { maxNodes, format },
    );
    res.type("text/plain").send(result);
  });

  // SPA fallback - serve index.html for all other routes
  app.get("/{*path}", (_req, res) => {
    res.sendFile(path.join(publicDir, "index.html"));
  });

  // Get port from config (required)
  const port = config?.server?.port;
  if (!port) {
    logger.error("[ts-graph] Error: No port configured. Add server.port to ts-graph-mcp.config.json");
    process.exit(1);
  }

  const server = app.listen(port, () => {
    logger.info(`ts-graph server running at http://localhost:${port}`);
    logger.info("Press CTRL+C to stop");
  });

  const close = async (): Promise<void> => {
    if (watchHandle) {
      await watchHandle.close();
    }
    return new Promise((resolve) => {
      server.close(() => {
        db.close();
        resolve();
      });
    });
  };

  // Handle graceful shutdown
  process.on("SIGINT", () => {
    logger.info("\nShutting down...");
    close().then(() => process.exit(0));
  });

  process.on("SIGTERM", () => {
    close().then(() => process.exit(0));
  });

  return { close, port };
};
