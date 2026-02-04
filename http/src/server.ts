import { existsSync } from "node:fs";
import path, { join } from "node:path";
import { fileURLToPath } from "node:url";
import type Database from "better-sqlite3";
import express from "express";
import type { ProjectConfig } from "./config/Config.schemas.js";
import { loadConfigOrDetect } from "./config/configLoader.utils.js";
import {
  getCacheDir,
  getOramaIndexPath,
  getSqliteDir,
} from "./config/getCacheDir.js";
import { createSqliteWriter } from "./db/sqlite/createSqliteWriter.js";
import { openDatabase } from "./db/sqlite/sqliteConnection.utils.js";
import { createEmbeddingProvider } from "./embedding/createEmbeddingProvider.js";
import type { EmbeddingProvider } from "./embedding/EmbeddingTypes.js";
import { DEFAULT_PRESET, EMBEDDING_PRESETS } from "./embedding/presets.js";
import { indexProject } from "./ingestion/indexProject.js";
import {
  type IndexManifest,
  loadManifest,
  populateManifest,
  saveManifest,
} from "./ingestion/manifest.js";
import { syncOnStartup } from "./ingestion/syncOnStartup.js";
import { type WatchHandle, watchProject } from "./ingestion/watchProject.js";
import { consoleLogger } from "./logging/ConsoleTsGraphLogger.js";
import type { TsGraphLogger } from "./logging/TsGraphLogger.js";
import { searchGraph } from "./query/search-graph/searchGraph.js";
import {
  createSearchIndex,
  loadSearchIndexFromFile,
  type SearchIndexWrapper,
} from "./search/createSearchIndex.js";
import { populateSearchIndex } from "./search/populateSearchIndex.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Index the project and return the open database connection.
 */
const indexAndOpenDb = async (
  projectRoot: string,
  cacheDir: string,
  modelName: string,
  forceReindex: boolean,
  logger: TsGraphLogger,
  searchIndex: SearchIndexWrapper,
  oramaIndexPath: string,
  searchIndexLoadedFromFile: boolean,
  embeddingProvider?: EmbeddingProvider,
): Promise<{
  db: Database.Database;
  indexedFiles: number;
  manifest: IndexManifest;
  config: ProjectConfig | null;
}> => {
  logger.info(`Cache: ${cacheDir}`);
  logger.info(`Project root: ${projectRoot}`);
  const dbPath = join(getSqliteDir(cacheDir), "graph.db");
  const dbExists = existsSync(dbPath);
  const db = openDatabase({ path: dbPath });

  const configResult = loadConfigOrDetect(projectRoot);

  if (!configResult) {
    logger.warn("No config file or tsconfig.json found. Nothing to index.");
    return {
      db,
      indexedFiles: 0,
      manifest: { version: 1, files: {} },
      config: null,
    };
  }

  if (forceReindex || !dbExists) {
    if (forceReindex) {
      logger.info("Force reindex requested. Clearing database...");
    } else {
      logger.info("Database not found. Indexing project...");
    }

    if (configResult.source === "explicit") {
      logger.info(`Using config: ${configResult.configPath}`);
    } else {
      logger.info("No config file found. Auto-detected tsconfig.json.");
    }

    const writer = createSqliteWriter(db);
    const result = await indexProject(configResult.config, writer, {
      projectRoot,
      cacheDir,
      modelName,
      clearFirst: forceReindex,
      logger,
      searchIndex,
      embeddingProvider,
    });

    logger.success(
      `Indexed ${result.filesProcessed} files (${result.nodesAdded} symbols, ${result.edgesAdded} connections) in ${result.durationMs}ms`,
    );

    if (result.errors && result.errors.length > 0) {
      logger.warn(`Indexing completed with ${result.errors.length} errors:`);
      for (const error of result.errors) {
        logger.error(`${error.file}: ${error.message}`);
      }
    }

    const manifest = loadManifest(cacheDir);
    populateManifest(manifest, result.filesIndexed, projectRoot);
    saveManifest(cacheDir, manifest);

    // Persist search index to disk
    await searchIndex.saveToFile(oramaIndexPath);

    return {
      db,
      indexedFiles: result.filesProcessed,
      manifest,
      config: configResult.config,
    };
  }

  logger.info("Using existing database. Checking for file changes...");

  const manifest = loadManifest(cacheDir);
  const syncResult = await syncOnStartup(db, configResult.config, manifest, {
    projectRoot,
    cacheDir,
    logger,
    searchIndex,
    embeddingProvider,
    modelName,
  });

  const totalChanges =
    syncResult.staleCount + syncResult.deletedCount + syncResult.addedCount;
  if (totalChanges > 0) {
    logger.success(
      `Synced ${totalChanges} file changes (${syncResult.staleCount} modified, ${syncResult.addedCount} new, ${syncResult.deletedCount} deleted) in ${syncResult.durationMs}ms`,
    );
  } else {
    logger.success("Database is up to date.");
  }

  if (syncResult.errors && syncResult.errors.length > 0) {
    logger.warn(`Sync completed with ${syncResult.errors.length} errors:`);
    for (const error of syncResult.errors) {
      logger.error(`${error.file}: ${error.message}`);
    }
  }

  // If search index wasn't loaded from file, populate from DB
  if (!searchIndexLoadedFromFile) {
    await populateSearchIndex(db, searchIndex);
    // Save the newly populated search index
    await searchIndex.saveToFile(oramaIndexPath);
  } else if (totalChanges > 0) {
    // Search index was loaded, but files changed - save updated index
    await searchIndex.saveToFile(oramaIndexPath);
  }

  // Get actual file count from database
  const countResult = db
    .prepare<[], { count: number }>(
      "SELECT COUNT(DISTINCT file_path) as count FROM nodes",
    )
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
  logger?: TsGraphLogger;
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

  // Load config early to get embedding settings
  const configResult = loadConfigOrDetect(projectRoot);
  const embeddingConfig = configResult?.config?.embedding;

  // Create embedding provider (always enabled, uses default preset if not configured)
  const presetName = embeddingConfig?.preset ?? DEFAULT_PRESET;
  const preset = EMBEDDING_PRESETS[presetName];

  if (!preset) {
    logger.error(`Unknown embedding preset: ${presetName}`);
    process.exit(1);
  }

  const vectorDimensions = preset.dimensions;
  logger.info(
    `Semantic search: ${presetName} (${vectorDimensions} dimensions)`,
  );

  let downloadComplete = false;
  const embeddingProvider = await createEmbeddingProvider({
    config: {
      preset: presetName,
      repo: embeddingConfig?.repo,
      filename: embeddingConfig?.filename,
      queryPrefix: embeddingConfig?.queryPrefix,
      documentPrefix: embeddingConfig?.documentPrefix,
    },
    modelsDir: join(cacheDir, "models"),
    onProgress: (downloaded, total) => {
      if (downloadComplete) {
        return;
      }
      const percent = Math.round((downloaded / total) * 100);
      process.stdout.write(`\rDownloading model: ${percent}%`);
      if (downloaded === total) {
        process.stdout.write("\n");
        downloadComplete = true;
      }
    },
  });

  // Initialize embedding provider (downloads model if needed) before indexing
  await embeddingProvider.initialize();

  // Try to load persisted search index, or create fresh
  const oramaIndexPath = getOramaIndexPath(cacheDir);
  let searchIndex: SearchIndexWrapper;
  let searchIndexLoadedFromFile = false;

  if (!shouldReindex) {
    const loaded = await loadSearchIndexFromFile(oramaIndexPath, {
      vectorDimensions,
    });
    if (loaded) {
      logger.info("Loaded search index from disk");
      searchIndex = loaded;
      searchIndexLoadedFromFile = true;
    } else {
      searchIndex = await createSearchIndex({ vectorDimensions });
    }
  } else {
    searchIndex = await createSearchIndex({ vectorDimensions });
  }

  // Index project and keep DB open (unified: SQLite + search index)
  const { db, indexedFiles, manifest, config } = await indexAndOpenDb(
    projectRoot,
    cacheDir,
    presetName,
    shouldReindex,
    logger,
    searchIndex,
    oramaIndexPath,
    searchIndexLoadedFromFile,
    embeddingProvider,
  );

  // Track indexed files count (updated after sync)
  const currentIndexedFiles = indexedFiles;

  // Start file watcher if we have a valid config
  let watchHandle: WatchHandle | null = null;
  if (config) {
    watchHandle = watchProject(db, config, manifest, {
      projectRoot,
      cacheDir,
      logger,
      searchIndex,
      embeddingProvider,
      oramaIndexPath,
      modelName: presetName,
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
    // biome-ignore lint/complexity/useLiteralKeys: index signature
    const query = req.query["q"] as string | undefined;
    if (!query || query.length < 1) {
      res.json([]);
      return;
    }

    // Search symbols by name (case-insensitive prefix match)
    const results = db
      .prepare<[string], { file_path: string; symbol: string; type: string }>(
        `SELECT file_path, name as symbol, type
         FROM nodes
         WHERE name LIKE ? || '%' COLLATE NOCASE
         ORDER BY name
         LIMIT 50`,
      )
      .all(query);

    res.json(results);
  });

  // Graph search endpoint
  app.use(express.json());
  app.post("/api/graph/search", async (req, res) => {
    const { topic, from, to, max_nodes } = req.body as {
      topic?: string;
      from?: { query?: string; symbol?: string; file_path?: string };
      to?: { query?: string; symbol?: string; file_path?: string };
      max_nodes?: number;
    };

    if (!topic && !from && !to) {
      res
        .status(400)
        .send("At least one of 'topic', 'from', or 'to' is required");
      return;
    }

    const result = await searchGraph(
      db,
      projectRoot,
      { topic, from, to, max_nodes },
      { searchIndex, embeddingProvider },
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
    logger.error(
      "No port configured. Add server.port to ts-graph-mcp.config.json",
    );
    process.exit(1);
  }

  const server = app.listen(port, () => {
    logger.success(`Server running at http://localhost:${port}`);
    logger.info("Press CTRL+C to stop");
  });

  const close = async (): Promise<void> => {
    if (watchHandle) {
      await watchHandle.close();
    }
    if (embeddingProvider) {
      await embeddingProvider.dispose();
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
    logger.info("Shutting down...");
    close().then(() => process.exit(0));
  });

  process.on("SIGTERM", () => {
    close().then(() => process.exit(0));
  });

  return { close, port };
};
