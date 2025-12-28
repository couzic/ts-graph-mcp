import type { Stats } from "node:fs";
import { existsSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import type Database from "better-sqlite3";
import { watch } from "chokidar";
import type { ProjectConfig } from "../config/Config.schemas.js";
import { createSqliteWriter } from "../db/sqlite/createSqliteWriter.js";
import { createProject } from "./createProject.js";
import type { NodeExtractionContext } from "./extract/nodes/NodeExtractionContext.js";
import { indexFile } from "./indexFile.js";
import {
  type IndexManifest,
  removeManifestEntry,
  saveManifest,
  updateManifestEntry,
} from "./manifest.js";

/**
 * Options for the file watcher.
 */
export interface WatchOptions {
  /** Project root directory */
  projectRoot: string;
  /** Cache directory (for saving manifest) */
  cacheDir: string;
  /** Debounce delay in ms (default: 300) */
  debounce?: number;
  /** Use polling instead of native fs events */
  usePolling?: boolean;
  /** Polling interval in ms when usePolling is true (default: 1000) */
  pollingInterval?: number;
  /** Suppress reindex log messages (default: false) */
  silent?: boolean;
}

/**
 * Handle returned by watchProject for cleanup.
 */
export interface WatchHandle {
  /** Stop watching and clean up resources */
  close(): Promise<void>;
  /** Promise that resolves when watcher is ready to detect changes */
  ready: Promise<void>;
}

/**
 * File context for extraction.
 */
interface FileContext {
  module: string;
  package: string;
  relativePath: string;
  tsconfigPath: string;
}

/**
 * Resolve a file path to its module/package context.
 * Returns null if the file doesn't belong to any configured package.
 */
const resolveFileContext = (
  absolutePath: string,
  config: ProjectConfig,
  projectRoot: string,
): FileContext | null => {
  for (const module of config.modules) {
    for (const pkg of module.packages) {
      const absoluteTsConfigPath = join(projectRoot, pkg.tsconfig);
      const packageRoot = dirname(absoluteTsConfigPath);

      if (absolutePath.startsWith(packageRoot)) {
        return {
          module: module.name,
          package: pkg.name,
          relativePath: relative(projectRoot, absolutePath),
          tsconfigPath: absoluteTsConfigPath,
        };
      }
    }
  }
  return null;
};

/**
 * Create a debouncer that batches file changes.
 */
const createDebouncer = (
  delayMs: number,
  handler: (files: Set<string>) => void,
): { add(path: string): void; flush(): void } => {
  let pending = new Set<string>();
  let timeoutId: NodeJS.Timeout | null = null;

  return {
    add(path: string): void {
      pending.add(path);
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      timeoutId = setTimeout(() => {
        const batch = pending;
        pending = new Set();
        timeoutId = null;
        handler(batch);
      }, delayMs);
    },
    flush(): void {
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
      if (pending.size > 0) {
        const batch = pending;
        pending = new Set();
        handler(batch);
      }
    },
  };
};

/**
 * Watch project files for changes and reindex automatically.
 *
 * Uses tsconfig as the source of truth for which files to index.
 * Only files that are part of the tsconfig compilation will be indexed.
 *
 * On file add/change: validates against tsconfig, removes old data, extracts new nodes/edges.
 * On file unlink: removes all nodes/edges for that file.
 */
export const watchProject = (
  db: Database.Database,
  config: ProjectConfig,
  manifest: IndexManifest,
  options: WatchOptions,
): WatchHandle => {
  const {
    projectRoot,
    cacheDir,
    debounce: debounceMs = 300,
    usePolling = false,
    pollingInterval = 1000,
    silent = false,
  } = options;

  const writer = createSqliteWriter(db);

  /**
   * Check if a file is part of the tsconfig compilation.
   * Creates a fresh Project to ensure accurate file discovery.
   */
  const isValidTsconfigFile = (
    tsconfigPath: string,
    absolutePath: string,
  ): boolean => {
    const project = createProject({ tsConfigFilePath: tsconfigPath });
    const sourceFiles = project.getSourceFiles();
    return sourceFiles.some((sf) => {
      const path = sf.getFilePath();
      return (
        path === absolutePath &&
        !path.includes("node_modules") &&
        !path.endsWith(".d.ts")
      );
    });
  };

  /**
   * Reindex a single file.
   * Creates a fresh Project for accurate cross-file resolution.
   */
  const reindexFile = async (
    absolutePath: string,
    context: FileContext,
  ): Promise<{ nodesAdded: number; edgesAdded: number }> => {
    // Validate file is part of tsconfig before indexing
    if (!isValidTsconfigFile(context.tsconfigPath, absolutePath)) {
      return { nodesAdded: 0, edgesAdded: 0 };
    }

    // Remove old data
    await writer.removeFileNodes(context.relativePath);

    // Create fresh Project for accurate import resolution (supports Yarn PnP)
    const project = createProject({ tsConfigFilePath: context.tsconfigPath });
    const sourceFile = project.addSourceFileAtPath(absolutePath);

    const extractionContext: NodeExtractionContext = {
      filePath: context.relativePath,
      module: context.module,
      package: context.package,
    };

    // Use shared indexFile function
    const result = await indexFile(sourceFile, extractionContext, writer);

    return result;
  };

  // Process a batch of changed files
  const processBatch = async (files: Set<string>): Promise<void> => {
    for (const absolutePath of files) {
      // Skip if file was deleted between event and processing
      if (!existsSync(absolutePath)) {
        continue;
      }

      const context = resolveFileContext(absolutePath, config, projectRoot);
      if (!context) {
        continue; // File not in any configured package
      }

      try {
        const { nodesAdded, edgesAdded } = await reindexFile(
          absolutePath,
          context,
        );

        // Only update manifest and log if file was actually indexed
        if (nodesAdded > 0 || edgesAdded > 0) {
          updateManifestEntry(manifest, context.relativePath, absolutePath);
          if (!silent) {
            console.error(
              `[ts-graph-mcp] Reindexed ${context.relativePath} (${nodesAdded} nodes, ${edgesAdded} edges)`,
            );
          }
        }
      } catch (error) {
        console.error(
          `[ts-graph-mcp] Error reindexing ${context.relativePath}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }
    // Save manifest after processing batch
    saveManifest(cacheDir, manifest);
  };

  // Handle file deletion
  const handleUnlink = async (relativePath: string): Promise<void> => {
    try {
      await writer.removeFileNodes(relativePath);
      removeManifestEntry(manifest, relativePath);
      saveManifest(cacheDir, manifest);
    } catch (error) {
      console.error(
        `[ts-graph-mcp] Error removing ${relativePath}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  };

  const debouncer = createDebouncer(debounceMs, (files) => {
    processBatch(files).catch((error) => {
      console.error(
        `[ts-graph-mcp] Batch processing error: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    });
  });

  // Filter function for chokidar v5: watch only .ts/.tsx files
  const shouldIgnore = (path: string, stats?: Stats): boolean => {
    // Always traverse directories, but skip node_modules
    if (!stats?.isFile()) {
      return path.includes("node_modules");
    }
    // Ignore .d.ts files and non-TypeScript files
    if (path.endsWith(".d.ts")) return true;
    return !path.endsWith(".ts") && !path.endsWith(".tsx");
  };

  // Initialize chokidar
  const watcher = watch(projectRoot, {
    ignored: shouldIgnore,
    ignoreInitial: true, // Don't process existing files
    persistent: true,
    usePolling,
    interval: usePolling ? pollingInterval : undefined,
  });

  // Create ready promise
  const readyPromise = new Promise<void>((resolve) => {
    watcher.once("ready", () => resolve());
  });

  watcher
    .on("add", (path) => {
      debouncer.add(path);
    })
    .on("change", (path) => {
      debouncer.add(path);
    })
    .on("unlink", (absolutePath) => {
      // Deletions are processed immediately (not debounced)
      const relativePath = relative(projectRoot, absolutePath);
      handleUnlink(relativePath);
    })
    .on("error", (error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[ts-graph-mcp] Watcher error: ${message}`);
    });

  return {
    async close(): Promise<void> {
      debouncer.flush();
      await watcher.close();
    },
    ready: readyPromise,
  };
};
