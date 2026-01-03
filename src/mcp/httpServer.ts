import type { Server } from "node:http";
import type Database from "better-sqlite3";
import express, { type Express, type Request, type Response } from "express";
import { dependenciesOf } from "../tools/dependencies-of/dependenciesOf.js";
import { dependentsOf } from "../tools/dependents-of/dependentsOf.js";
import { pathsBetween } from "../tools/paths-between/pathsBetween.js";
import {
  removeServerMetadata,
  type ServerMetadata,
  writeServerMetadata,
} from "./serverMetadata.js";
import { HTTP_API_VERSION } from "./versions.js";

/**
 * Mutable server state that can be updated after server starts.
 */
export interface ServerState {
  /** Whether indexing is complete and server is ready for queries */
  ready: boolean;
}

/**
 * Options for the HTTP API server.
 */
export interface HttpServerOptions {
  /** Database connection */
  db: Database.Database;
  /** Cache directory (contains graph.db, manifest.json, server.json) */
  cacheDir: string;
  /** Project root for resolving file paths */
  projectRoot: string;
  /** Server state (can be mutated to update ready status) */
  state: ServerState;
  /** Port to listen on (0 for dynamic) */
  port?: number;
  /** Host to bind to */
  host?: string;
}

/**
 * Start the HTTP API server.
 *
 * This is NOT an MCP server - it's a simple REST API that the stdio MCP server
 * calls to execute queries. The HTTP server holds the shared resources
 * (database, file watcher) that multiple Claude sessions can share.
 *
 * @param options - Server configuration
 * @returns Server instance and metadata
 */
export const startHttpServer = async (
  options: HttpServerOptions,
): Promise<{ server: Server; metadata: ServerMetadata }> => {
  const {
    db,
    cacheDir,
    projectRoot,
    state,
    port = 0,
    host = "127.0.0.1",
  } = options;

  const app: Express = express();
  app.use(express.json());

  // Health check endpoint - returns ready status
  app.get("/health", (_req: Request, res: Response) => {
    res.json({ status: "ok", ready: state.ready });
  });

  // Stop endpoint - gracefully shuts down the server
  app.post("/stop", (_req: Request, res: Response) => {
    console.error("[ts-graph-mcp] Received stop request, shutting down...");
    res.json({ status: "stopping" });
    // Delay exit to allow response to be sent
    setImmediate(() => {
      process.exit(0);
    });
  });

  // Version endpoint - returns API version for compatibility checks
  app.get("/version", (_req: Request, res: Response) => {
    res.json({ apiVersion: HTTP_API_VERSION });
  });

  // Message returned when server is still indexing
  const indexingMessage =
    "Database is still indexing. Please wait a moment and try again.";

  // API endpoints for graph queries
  app.post("/api/dependenciesOf", (req: Request, res: Response) => {
    if (!state.ready) {
      res.status(503).json({ error: indexingMessage, indexing: true });
      return;
    }
    try {
      const { file_path, symbol } = req.body;
      if (!file_path || !symbol) {
        res.status(400).json({ error: "file_path and symbol are required" });
        return;
      }
      const result = dependenciesOf(db, projectRoot, file_path, symbol);
      res.json({ result });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ error: message });
    }
  });

  app.post("/api/dependentsOf", (req: Request, res: Response) => {
    if (!state.ready) {
      res.status(503).json({ error: indexingMessage, indexing: true });
      return;
    }
    try {
      const { file_path, symbol } = req.body;
      if (!file_path || !symbol) {
        res.status(400).json({ error: "file_path and symbol are required" });
        return;
      }
      const result = dependentsOf(db, projectRoot, file_path, symbol);
      res.json({ result });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ error: message });
    }
  });

  app.post("/api/pathsBetween", (req: Request, res: Response) => {
    if (!state.ready) {
      res.status(503).json({ error: indexingMessage, indexing: true });
      return;
    }
    try {
      const { from, to } = req.body;
      if (!from?.file_path || !from?.symbol || !to?.file_path || !to?.symbol) {
        res.status(400).json({
          error: "from and to with file_path and symbol are required",
        });
        return;
      }
      const result = pathsBetween(db, projectRoot, from, to);
      res.json({ result });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ error: message });
    }
  });

  // Start listening
  return new Promise((resolve, reject) => {
    const server = app.listen(port, host, () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("Failed to get server address"));
        return;
      }

      const actualPort = address.port;
      const metadata: ServerMetadata = {
        pid: process.pid,
        port: actualPort,
        host,
        startedAt: new Date().toISOString(),
        projectRoot,
        ready: state.ready,
      };

      // Write metadata to disk for discovery
      writeServerMetadata(cacheDir, metadata);

      console.error(
        `[ts-graph-mcp] HTTP API server listening on ${host}:${actualPort}`,
      );

      // Clean up on shutdown
      const cleanup = () => {
        removeServerMetadata(cacheDir);
        server.close();
      };

      process.on("SIGINT", cleanup);
      process.on("SIGTERM", cleanup);

      resolve({ server, metadata });
    });

    server.on("error", (error: Error) => {
      reject(error);
    });
  });
};
