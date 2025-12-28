import { existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const SERVER_METADATA_FILE = "server.json";

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
    // Server not responding - might be starting up or crashed
    // Don't remove metadata yet, let caller decide
  }

  return null;
};
