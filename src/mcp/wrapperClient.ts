import { spawn } from "node:child_process";
import { existsSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import Database from "better-sqlite3";
import { z } from "zod";
import packageJson from "../../package.json" with { type: "json" };
import {
  acquireSpawnLock,
  getRunningServer,
  releaseSpawnLock,
  removeServerMetadata,
  type ServerMetadata,
  stopHttpServer,
} from "./serverMetadata.js";
import {
  dependenciesOfDescription,
  dependentsOfDescription,
  pathsBetweenDescription,
} from "./toolDescriptions.js";
import { DB_SCHEMA_VERSION, HTTP_API_VERSION } from "./versions.js";

/**
 * Options for the wrapper client.
 */
export interface WrapperClientOptions {
  /** Project root directory */
  projectRoot: string;
  /** Cache directory (contains graph.db, manifest.json, server.json) */
  cacheDir: string;
  /** Server port override (passed to server) */
  port?: number;
  /** Server host override (passed to server) */
  host?: string;
}

/**
 * Spawn the HTTP API server as a detached background process.
 */
const spawnApiServer = (options: WrapperClientOptions): void => {
  const args = ["--api-server", "--cache-dir", options.cacheDir];

  if (options.port) {
    args.push("--port", String(options.port));
  }
  if (options.host) {
    args.push("--host", options.host);
  }

  const scriptPath = process.argv[1];
  if (!scriptPath) {
    throw new Error("Could not determine script path");
  }

  // Spawn detached process
  const child = spawn(process.execPath, [scriptPath, ...args], {
    detached: true,
    stdio: "ignore",
    cwd: options.projectRoot,
  });

  // Don't wait for the child process
  child.unref();
};

/**
 * Wait for the API server to become available.
 */
const waitForApiServer = async (
  cacheDir: string,
  maxWaitMs: number = 15000,
): Promise<ServerMetadata> => {
  const startTime = Date.now();
  const pollInterval = 200;

  while (Date.now() - startTime < maxWaitMs) {
    const server = await getRunningServer(cacheDir);
    if (server) {
      return server;
    }
    await new Promise((resolve) => setTimeout(resolve, pollInterval));
  }

  throw new Error("Timeout waiting for HTTP API server to start");
};

/**
 * Make an HTTP request to the API server.
 */
const callApi = async <T>(
  metadata: ServerMetadata,
  endpoint: string,
  body: unknown,
): Promise<T> => {
  const url = `http://${metadata.host}:${metadata.port}${endpoint}`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const data = (await response.json()) as T & { error?: string };

  if (!response.ok) {
    throw new Error(data.error || `API error: ${response.status}`);
  }

  return data;
};

/**
 * Check DB schema version via direct SQLite read.
 * Returns true if server needs restart (DB was deleted).
 */
const checkDbVersion = async (
  cacheDir: string,
  server: ServerMetadata | null,
): Promise<boolean> => {
  const dbPath = join(cacheDir, "graph.db");

  if (!existsSync(dbPath)) {
    return false; // No DB yet, server will create it
  }

  // Open DB read-only just to check version
  const db = new Database(dbPath, { readonly: true });
  const dbVersion = db.pragma("user_version", { simple: true }) as number;
  db.close();

  if (DB_SCHEMA_VERSION < dbVersion) {
    console.error(
      `[ts-graph-mcp] DB schema (${dbVersion}) is newer than wrapper (${DB_SCHEMA_VERSION}). Please update ts-graph-mcp.`,
    );
    process.exit(1);
  }

  if (DB_SCHEMA_VERSION > dbVersion) {
    console.error(
      `[ts-graph-mcp] DB schema (${dbVersion}) is older than wrapper (${DB_SCHEMA_VERSION}). Reindexing...`,
    );

    // Stop server if running (it has the DB open)
    if (server) {
      await stopHttpServer(cacheDir);
      removeServerMetadata(cacheDir);
    }

    unlinkSync(dbPath);
    const manifestPath = join(cacheDir, "manifest.json");
    if (existsSync(manifestPath)) {
      unlinkSync(manifestPath);
    }

    return true; // Server needs restart
  }

  return false;
};

/**
 * Check API version via HTTP endpoint.
 * Returns potentially new server metadata if server was restarted.
 */
const checkApiVersion = async (
  server: ServerMetadata,
  cacheDir: string,
  options: WrapperClientOptions,
): Promise<ServerMetadata> => {
  const versionUrl = `http://${server.host}:${server.port}/version`;
  let versionResponse: Response;
  try {
    versionResponse = await fetch(versionUrl);
  } catch {
    console.error("[ts-graph-mcp] Server unavailable. Please restart.");
    process.exit(1);
  }
  const { apiVersion } = (await versionResponse.json()) as {
    apiVersion: number;
  };

  if (HTTP_API_VERSION < apiVersion) {
    console.error(
      `[ts-graph-mcp] Server API (${apiVersion}) is newer than wrapper (${HTTP_API_VERSION}). Please update ts-graph-mcp.`,
    );
    process.exit(1);
  }

  if (HTTP_API_VERSION > apiVersion) {
    console.error(
      `[ts-graph-mcp] Server API (${apiVersion}) is older than wrapper (${HTTP_API_VERSION}). Restarting server...`,
    );
    await stopHttpServer(cacheDir);
    removeServerMetadata(cacheDir);
    spawnApiServer(options);
    return await waitForApiServer(cacheDir);
  }

  return server;
};

/**
 * Run the stdio MCP server that proxies to the HTTP API.
 *
 * This is the real MCP server that Claude Code talks to. It registers
 * the graph query tools and forwards requests to the shared HTTP API server.
 */
export const runWrapperClient = async (
  options: WrapperClientOptions,
): Promise<void> => {
  const { cacheDir } = options;

  // Check DB version before spawning/connecting to server
  await checkDbVersion(cacheDir, null);

  // Check for existing API server, spawn if needed
  let server = await getRunningServer(cacheDir);

  if (!server) {
    // Use lock to prevent concurrent spawns
    if (acquireSpawnLock(cacheDir)) {
      try {
        // Double-check after acquiring lock (another process may have spawned)
        server = await getRunningServer(cacheDir);
        if (!server) {
          console.error("[ts-graph-mcp] Starting HTTP API server...");
          spawnApiServer(options);
          server = await waitForApiServer(cacheDir);
          console.error(
            `[ts-graph-mcp] API server started on ${server.host}:${server.port}`,
          );
        } else {
          console.error(
            `[ts-graph-mcp] Using existing API server on ${server.host}:${server.port}`,
          );
        }
      } finally {
        releaseSpawnLock(cacheDir);
      }
    } else {
      // Another process is spawning, wait for it
      console.error("[ts-graph-mcp] Waiting for API server to start...");
      server = await waitForApiServer(cacheDir);
      console.error(
        `[ts-graph-mcp] API server ready on ${server.host}:${server.port}`,
      );
    }
  } else {
    console.error(
      `[ts-graph-mcp] Using existing API server on ${server.host}:${server.port}`,
    );
  }

  // Check API version at startup
  server = await checkApiVersion(server, cacheDir, options);

  // Create MCP server
  const mcpServer = new McpServer({
    name: packageJson.name,
    version: packageJson.version,
  });

  // Shared Zod schemas
  const symbolLocationSchema = {
    file_path: z
      .string()
      .describe("File path containing the symbol (e.g., 'src/utils.ts')"),
    symbol: z
      .string()
      .describe("Symbol name (e.g., 'formatDate', 'User.save')"),
  };

  // Capture server metadata for API calls (mutable - may be updated if server restarts)
  let apiServer = server;

  /**
   * Check versions and make API call.
   * Checks both DB and API versions before each tool call.
   */
  const checkVersionsAndCall = async <T>(
    endpoint: string,
    body: unknown,
  ): Promise<T> => {
    // Check DB version first (might delete DB and require server restart)
    const dbNeedsRestart = await checkDbVersion(cacheDir, apiServer);

    if (dbNeedsRestart) {
      // DB was deleted, need to respawn server
      spawnApiServer(options);
      apiServer = await waitForApiServer(cacheDir);
    } else {
      // Check API version
      apiServer = await checkApiVersion(apiServer, cacheDir, options);
    }

    return callApi<T>(apiServer, endpoint, body);
  };

  // Register dependenciesOf tool
  mcpServer.registerTool(
    "dependenciesOf",
    {
      description: dependenciesOfDescription,
      inputSchema: symbolLocationSchema,
    },
    async ({ file_path, symbol }) => {
      try {
        const data = await checkVersionsAndCall<{ result: string }>(
          "/api/dependenciesOf",
          { file_path, symbol },
        );
        return { content: [{ type: "text", text: data.result }] };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          content: [{ type: "text", text: `Error: ${message}` }],
          isError: true,
        };
      }
    },
  );

  // Register dependentsOf tool
  mcpServer.registerTool(
    "dependentsOf",
    {
      description: dependentsOfDescription,
      inputSchema: symbolLocationSchema,
    },
    async ({ file_path, symbol }) => {
      try {
        const data = await checkVersionsAndCall<{ result: string }>(
          "/api/dependentsOf",
          { file_path, symbol },
        );
        return { content: [{ type: "text", text: data.result }] };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          content: [{ type: "text", text: `Error: ${message}` }],
          isError: true,
        };
      }
    },
  );

  // Register pathsBetween tool
  mcpServer.registerTool(
    "pathsBetween",
    {
      description: pathsBetweenDescription,
      inputSchema: {
        from: z
          .object({
            file_path: z
              .string()
              .describe("File path (e.g., 'src/api/handler.ts')"),
            symbol: z.string().describe("Symbol name (e.g., 'handleRequest')"),
          })
          .describe("Source symbol"),
        to: z
          .object({
            file_path: z
              .string()
              .describe("File path (e.g., 'src/db/queries.ts')"),
            symbol: z.string().describe("Symbol name (e.g., 'executeQuery')"),
          })
          .describe("Target symbol"),
      },
    },
    async ({ from, to }) => {
      try {
        const data = await checkVersionsAndCall<{ result: string }>(
          "/api/pathsBetween",
          { from, to },
        );
        return { content: [{ type: "text", text: data.result }] };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          content: [{ type: "text", text: `Error: ${message}` }],
          isError: true,
        };
      }
    },
  );

  // Start MCP server on stdio
  const transport = new StdioServerTransport();
  await mcpServer.connect(transport);
};
