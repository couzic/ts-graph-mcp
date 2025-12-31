#!/usr/bin/env node

// Early error handlers to catch module loading failures
process.on("uncaughtException", (error) => {
  console.error("[ts-graph-mcp] Uncaught exception:", error.message);
  if (error.stack) console.error(error.stack);
  process.exit(1);
});
process.on("unhandledRejection", (reason) => {
  console.error("[ts-graph-mcp] Unhandled rejection:", reason);
  process.exit(1);
});

import { realpathSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { getCacheDir } from "../config/getCacheDir.js";
import { runFullIndex } from "../ingestion/runFullIndex.js";
import { type ServerState, startHttpServer } from "./httpServer.js";
import {
  initializeServerCoreQuick,
  runIndexingAndWatch,
} from "./serverCore.js";
import { writeServerMetadata } from "./serverMetadata.js";
import { runWrapperClient } from "./wrapperClient.js";

/**
 * Parsed command-line arguments.
 */
interface ParsedArgs {
  /** Cache directory (contains graph.db, manifest.json, server.json) */
  cacheDir?: string;
  /** HTTP server port */
  port?: number;
  /** HTTP server host */
  host?: string;
  /** Run as HTTP API server (spawned by stdio MCP server) */
  apiServer?: boolean;
  /** Run indexing only (no server) */
  indexOnly?: boolean;
  /** Delete cache before starting (forces full reindex) */
  clean?: boolean;
}

/**
 * Parse command-line arguments.
 */
const parseArgs = (): ParsedArgs => {
  const args = process.argv.slice(2);
  const result: ParsedArgs = {};

  let i = 0;
  while (i < args.length) {
    const arg = args[i];

    if (arg === "--api-server") {
      result.apiServer = true;
    } else if (arg === "--index") {
      result.indexOnly = true;
    } else if (arg === "--clean") {
      result.clean = true;
    } else if (arg === "--reindex") {
      // --reindex is shorthand for --index --clean
      result.indexOnly = true;
      result.clean = true;
    } else if (arg === "--cache-dir") {
      const nextArg = args[i + 1];
      if (nextArg) {
        result.cacheDir = resolve(nextArg);
        i++;
      }
    } else if (arg === "--port") {
      const nextArg = args[i + 1];
      if (nextArg) {
        result.port = parseInt(nextArg, 10);
        i++;
      }
    } else if (arg === "--host") {
      const nextArg = args[i + 1];
      if (nextArg) {
        result.host = nextArg;
        i++;
      }
    }

    i++;
  }

  return result;
};

/**
 * Delete the cache directory to force a full reindex.
 */
const cleanCacheDir = (cacheDir: string): void => {
  console.error(`[ts-graph-mcp] Cleaning cache directory: ${cacheDir}`);
  rmSync(cacheDir, { recursive: true, force: true });
};

/**
 * Run indexing only, without starting any server.
 * Useful for pre-warming the cache or debugging indexing issues.
 */
const runIndexOnly = async (
  projectRoot: string,
  cacheDir: string,
): Promise<void> => {
  console.error("[ts-graph-mcp] Running indexing only (no server)...");
  await runFullIndex({ projectRoot, cacheDir });
  console.error("[ts-graph-mcp] Indexing complete.");
};

/**
 * Run in HTTP API server mode (spawned by stdio MCP server).
 * Starts the HTTP API server immediately, then indexes in background.
 */
const runApiServer = async (
  projectRoot: string,
  cacheDir: string,
  port?: number,
  host?: string,
): Promise<void> => {
  // Quick init - just open DB and load config (instant)
  const { db, configResult, dbExists } = initializeServerCoreQuick({
    projectRoot,
    cacheDir,
  });

  // Mutable state for server readiness
  const state: ServerState = { ready: false };

  // Track watch handle for shutdown
  let watchHandleRef: { close: () => Promise<void> } | null = null;

  // Set up graceful shutdown
  const shutdown = async () => {
    console.error("\n[ts-graph-mcp] Shutting down...");
    if (watchHandleRef) {
      await watchHandleRef.close();
    }
    db.close();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  // Start HTTP server immediately (before indexing)
  const { metadata } = await startHttpServer({
    db,
    cacheDir,
    projectRoot,
    state,
    port,
    host,
  });

  // If no config found, we're done (empty database)
  if (!configResult) {
    state.ready = true;
    writeServerMetadata(cacheDir, { ...metadata, ready: true });
    console.error("[ts-graph-mcp] Server running. Press Ctrl+C to stop.");
    return;
  }

  // Run indexing in background
  runIndexingAndWatch({
    projectRoot,
    cacheDir,
    db,
    configResult,
    dbExists,
    onComplete: () => {
      state.ready = true;
      writeServerMetadata(cacheDir, { ...metadata, ready: true });
      console.error("[ts-graph-mcp] Server ready.");
    },
  })
    .then(({ watchHandle }) => {
      watchHandleRef = watchHandle;
    })
    .catch((error) => {
      console.error("[ts-graph-mcp] Indexing failed:", error);
    });

  console.error("[ts-graph-mcp] Server running. Press Ctrl+C to stop.");
};

/**
 * Run in stdio MCP server mode (default).
 * Spawns HTTP API server if needed, then handles MCP protocol on stdio.
 */
const runStdioMcpServer = async (
  projectRoot: string,
  cacheDir: string,
  port?: number,
  host?: string,
): Promise<void> => {
  await runWrapperClient({
    projectRoot,
    cacheDir,
    port,
    host,
  });
};

/**
 * Main entry point.
 */
export const main = async (): Promise<void> => {
  try {
    const projectRoot = process.cwd();
    const args = parseArgs();
    const cacheDir = args.cacheDir ?? getCacheDir(projectRoot);

    // Clean cache directory if requested (before any other operation)
    if (args.clean) {
      cleanCacheDir(cacheDir);
    }

    if (args.indexOnly) {
      // Index only mode - run indexing and exit
      await runIndexOnly(projectRoot, cacheDir);
    } else if (args.apiServer) {
      // HTTP API server mode (spawned by stdio MCP server)
      await runApiServer(projectRoot, cacheDir, args.port, args.host);
    } else {
      // Stdio MCP server mode (default) - handles MCP protocol, calls HTTP API
      await runStdioMcpServer(projectRoot, cacheDir, args.port, args.host);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[ts-graph-mcp] Fatal error: ${message}`);
    if (error instanceof Error && error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  }
};

// Run main if executed directly
// Use realpathSync to handle npm bin symlinks (process.argv[1] may be a symlink)
const resolvedScript = process.argv[1] ? realpathSync(process.argv[1]) : "";
if (import.meta.url === `file://${resolvedScript}`) {
  main().catch((error) => {
    console.error("[ts-graph-mcp] Unhandled error:", error);
    process.exit(1);
  });
}
