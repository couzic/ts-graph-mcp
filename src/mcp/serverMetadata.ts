import {
  closeSync,
  existsSync,
  openSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";

const SERVER_METADATA_FILE = "server.json";
const SPAWN_LOCK_FILE = "spawn.lock";

/**
 * Metadata about a running HTTP server instance.
 */
export interface ServerMetadata {
  /** Process ID of the server */
  pid: number;
  /** HTTP port the server is listening on */
  port: number;
  /** Host address the server is bound to */
  host: string;
  /** ISO timestamp when server started */
  startedAt: string;
  /** Project root this server is indexing */
  projectRoot: string;
  /** Whether the server has finished indexing and is ready to serve queries */
  ready: boolean;
}

/**
 * Get the path to the server metadata file.
 */
export const getServerMetadataPath = (cacheDir: string): string => {
  return join(cacheDir, SERVER_METADATA_FILE);
};

/**
 * Read server metadata from disk.
 * Returns null if file doesn't exist or is invalid.
 */
export const readServerMetadata = (cacheDir: string): ServerMetadata | null => {
  const metadataPath = getServerMetadataPath(cacheDir);

  if (!existsSync(metadataPath)) {
    return null;
  }

  try {
    const content = readFileSync(metadataPath, "utf-8");
    const metadata = JSON.parse(content) as ServerMetadata;

    // Basic validation
    if (
      typeof metadata.pid !== "number" ||
      typeof metadata.port !== "number" ||
      typeof metadata.host !== "string"
    ) {
      return null;
    }

    return metadata;
  } catch {
    return null;
  }
};

/**
 * Write server metadata to disk.
 */
export const writeServerMetadata = (
  cacheDir: string,
  metadata: ServerMetadata,
): void => {
  const metadataPath = getServerMetadataPath(cacheDir);
  writeFileSync(metadataPath, JSON.stringify(metadata, null, 2), "utf-8");
};

/**
 * Remove server metadata file.
 */
export const removeServerMetadata = (cacheDir: string): void => {
  const metadataPath = getServerMetadataPath(cacheDir);
  if (existsSync(metadataPath)) {
    unlinkSync(metadataPath);
  }
};

/**
 * Check if a process is still running.
 */
export const isProcessRunning = (pid: number): boolean => {
  try {
    // Sending signal 0 checks if process exists without killing it
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

/**
 * Check if a server is running and healthy.
 * Returns the metadata if server is running, null otherwise.
 */
export const getRunningServer = async (
  cacheDir: string,
): Promise<ServerMetadata | null> => {
  const metadata = readServerMetadata(cacheDir);

  if (!metadata) {
    return null;
  }

  // Check if process is still running
  if (!isProcessRunning(metadata.pid)) {
    // Stale metadata - clean up
    removeServerMetadata(cacheDir);
    return null;
  }

  // Health check via HTTP
  try {
    const response = await fetch(
      `http://${metadata.host}:${metadata.port}/health`,
      { signal: AbortSignal.timeout(2000) },
    );
    if (response.ok) {
      return metadata;
    }
  } catch {
    // Server not responding but process is running - trust the PID check
    // This prevents spawning duplicate servers when the existing one is slow (e.g., indexing)
    return metadata;
  }

  return null;
};

/**
 * Try to acquire exclusive lock for spawning a server.
 * Returns true if lock acquired, false if another process holds it.
 *
 * @example
 * if (acquireSpawnLock(cacheDir)) {
 *   try {
 *     // spawn server
 *   } finally {
 *     releaseSpawnLock(cacheDir);
 *   }
 * }
 */
export const acquireSpawnLock = (cacheDir: string): boolean => {
  const lockPath = join(cacheDir, SPAWN_LOCK_FILE);

  // Check for stale lock (process no longer running)
  if (existsSync(lockPath)) {
    try {
      const content = readFileSync(lockPath, "utf-8");
      const pid = Number.parseInt(content, 10);
      if (!Number.isNaN(pid) && !isProcessRunning(pid)) {
        // Stale lock - remove it
        unlinkSync(lockPath);
      }
    } catch {
      // Ignore read errors, try to acquire anyway
    }
  }

  // Try to create lock file exclusively (O_EXCL fails if file exists)
  try {
    const fd = openSync(lockPath, "wx");
    writeFileSync(fd, String(process.pid), "utf-8");
    closeSync(fd);
    return true;
  } catch {
    // Lock already held by another process
    return false;
  }
};

/**
 * Release the spawn lock.
 */
export const releaseSpawnLock = (cacheDir: string): void => {
  const lockPath = join(cacheDir, SPAWN_LOCK_FILE);
  if (existsSync(lockPath)) {
    try {
      unlinkSync(lockPath);
    } catch {
      // Ignore errors (file may have been removed already)
    }
  }
};

/**
 * Stop a running HTTP server gracefully.
 * Tries HTTP /stop endpoint first, falls back to SIGTERM.
 */
export const stopHttpServer = async (cacheDir: string): Promise<void> => {
  const metadata = readServerMetadata(cacheDir);
  if (!metadata || !isProcessRunning(metadata.pid)) {
    return;
  }

  console.error(
    `[ts-graph-mcp] Stopping running server (PID ${metadata.pid})...`,
  );

  // Try graceful HTTP shutdown first
  try {
    await fetch(`http://${metadata.host}:${metadata.port}/stop`, {
      method: "POST",
      signal: AbortSignal.timeout(2000),
    });
  } catch {
    // Endpoint failed, fall back to SIGTERM
    console.error("[ts-graph-mcp] HTTP stop failed, sending SIGTERM...");
    process.kill(metadata.pid, "SIGTERM");
  }

  // Wait for process to exit
  const timeout = Date.now() + 5000;
  while (isProcessRunning(metadata.pid) && Date.now() < timeout) {
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  if (isProcessRunning(metadata.pid)) {
    console.error("[ts-graph-mcp] Warning: Server did not stop within timeout");
  }
};
