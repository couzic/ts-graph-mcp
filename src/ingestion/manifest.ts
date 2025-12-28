import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/**
 * File metadata stored in the manifest.
 */
export interface FileEntry {
  /** File modification time in milliseconds */
  mtime: number;
  /** File size in bytes */
  size: number;
}

/**
 * Index manifest tracking indexed files and their metadata.
 * Used to detect changes on startup (files modified while server was offline).
 */
export interface IndexManifest {
  /** Schema version for future compatibility */
  version: 1;
  /** Map of relative file paths to their metadata */
  files: Record<string, FileEntry>;
}

/**
 * Result of syncing manifest with filesystem.
 */
export interface SyncResult {
  /** Files that have been modified (mtime or size changed) */
  stale: string[];
  /** Files that no longer exist on disk */
  deleted: string[];
  /** Files on disk that are not in the manifest */
  added: string[];
}

/**
 * Get the manifest file path for a given cache directory.
 */
export const getManifestPath = (cacheDir: string): string => {
  return join(cacheDir, "manifest.json");
};

/**
 * Load manifest from disk. Returns empty manifest if file doesn't exist.
 */
export const loadManifest = (cacheDir: string): IndexManifest => {
  const manifestPath = getManifestPath(cacheDir);

  if (!existsSync(manifestPath)) {
    return { version: 1, files: {} };
  }

  try {
    const content = readFileSync(manifestPath, "utf-8");
    const parsed = JSON.parse(content) as IndexManifest;

    // Validate version
    if (parsed.version !== 1) {
      console.error(
        `[ts-graph-mcp] Unknown manifest version ${parsed.version}, starting fresh`,
      );
      return { version: 1, files: {} };
    }

    return parsed;
  } catch (error) {
    console.error(
      `[ts-graph-mcp] Failed to load manifest: ${error instanceof Error ? error.message : String(error)}`,
    );
    return { version: 1, files: {} };
  }
};

/**
 * Save manifest to disk.
 */
export const saveManifest = (
  cacheDir: string,
  manifest: IndexManifest,
): void => {
  const manifestPath = getManifestPath(cacheDir);

  try {
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  } catch (error) {
    console.error(
      `[ts-graph-mcp] Failed to save manifest: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
};

/**
 * Update a single file entry in the manifest.
 */
export const updateManifestEntry = (
  manifest: IndexManifest,
  relativePath: string,
  absolutePath: string,
): void => {
  try {
    const stat = statSync(absolutePath);
    manifest.files[relativePath] = {
      mtime: stat.mtimeMs,
      size: stat.size,
    };
  } catch {
    // File doesn't exist, remove from manifest
    delete manifest.files[relativePath];
  }
};

/**
 * Remove a file entry from the manifest.
 */
export const removeManifestEntry = (
  manifest: IndexManifest,
  relativePath: string,
): void => {
  delete manifest.files[relativePath];
};

/**
 * Populate manifest with files from initial indexing.
 * Records mtime/size for each file without triggering reindex.
 */
export const populateManifest = (
  manifest: IndexManifest,
  relativePaths: string[],
  projectRoot: string,
): void => {
  for (const relativePath of relativePaths) {
    const absolutePath = join(projectRoot, relativePath);
    updateManifestEntry(manifest, relativePath, absolutePath);
  }
};

/**
 * Compare manifest with current filesystem state.
 * Returns lists of stale, deleted, and added files.
 */
export const compareManifest = (
  manifest: IndexManifest,
  currentFiles: string[],
  projectRoot: string,
): SyncResult => {
  const stale: string[] = [];
  const deleted: string[] = [];
  const added: string[] = [];

  // Check files in manifest
  for (const [relativePath, entry] of Object.entries(manifest.files)) {
    const absolutePath = join(projectRoot, relativePath);

    try {
      const stat = statSync(absolutePath);
      if (stat.mtimeMs !== entry.mtime || stat.size !== entry.size) {
        stale.push(relativePath);
      }
    } catch {
      // File doesn't exist
      deleted.push(relativePath);
    }
  }

  // Check for new files
  for (const relativePath of currentFiles) {
    if (!(relativePath in manifest.files)) {
      added.push(relativePath);
    }
  }

  return { stale, deleted, added };
};
