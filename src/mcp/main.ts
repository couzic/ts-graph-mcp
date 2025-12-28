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

import { realpathSync } from "node:fs";
import { resolve } from "node:path";
import { getCacheDir } from "../config/getCacheDir.js";
import { startHttpServer } from "./httpServer.js";
import { initializeServerCore } from "./serverCore.js";
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
 * Run in HTTP API server mode (spawned by stdio MCP server).
 * Starts the HTTP API server with database and file watcher.
 */
const runApiServer = async (
  projectRoot: string,
  cacheDir: string,
  port?: number,
  host?: string,
): Promise<void> => {
  // Initialize database, indexing, and file watcher
  const { db, watchHandle } = await initializeServerCore({
    projectRoot,
    cacheDir,
  });

  // Set up graceful shutdown
  const shutdown = async () => {
    console.error("\n[ts-graph-mcp] Shutting down...");
    if (watchHandle) {
      await watchHandle.close();
    }
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  // Start HTTP server
  await startHttpServer({
    db,
    cacheDir,
    projectRoot,
    port,
    host,
  });

  // Keep process running
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

    if (args.apiServer) {
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
