import type { Stats } from "node:fs";
import { existsSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import type Database from "better-sqlite3";
import { watch } from "chokidar";
import { Subject, type Subscription } from "rxjs";
import type { ProjectConfig } from "../config/Config.schemas.js";
import { createSqliteWriter } from "../db/sqlite/createSqliteWriter.js";
import type { EmbeddingProvider } from "../embedding/EmbeddingTypes.js";
import {
  type EmbeddingCacheConnection,
  openEmbeddingCache,
} from "../embedding/embeddingCache.js";
import type { TsGraphLogger } from "../logging/TsGraphLogger.js";
import type { SearchIndexWrapper } from "../search/createSearchIndex.js";
import { bufferDebounce } from "./bufferDebounce.js";
import { createProject } from "./createProject.js";
import type { EdgeExtractionContext } from "./extract/edges/EdgeExtractionContext.js";
import { extractConfiguredPackageNames } from "./extractConfiguredPackageNames.js";
import { indexFile } from "./indexFile.js";
import {
  type IndexManifest,
  removeManifestEntry,
  saveManifest,
  updateManifestEntry,
} from "./manifest.js";
import { createProjectRegistry } from "./ProjectRegistry.js";

/**
 * Options for the file watcher.
 */
export interface WatchOptions {
  /** Project root directory */
  projectRoot: string;
  /** Cache directory (for saving manifest) */
  cacheDir: string;

  // Polling (for WSL2/Docker/NFS)
  /** Use polling instead of native fs events */
  polling?: boolean;
  /** Polling interval in ms when polling is true (default: 1000) */
  pollingInterval?: number;

  // Debouncing (for fs.watch mode only — ignored when polling is true)
  /** Enable debouncing of file events (default: true). Only applies when polling is false. */
  debounce?: boolean;
  /** Debounce delay in ms (default: 300). Only applies when debounce is true. */
  debounceInterval?: number;

  // Exclusions
  /** Directories to exclude from watching (globs supported) */
  excludeDirectories?: string[];
  /** Files to exclude from watching (globs supported) */
  excludeFiles?: string[];

  // Logging
  /** Logger for watch output */
  logger: TsGraphLogger;

  // Search
  /** Search index for unified indexing (optional) */
  searchIndex?: SearchIndexWrapper;
  /** Embedding provider for semantic search */
  embeddingProvider: EmbeddingProvider;
  /** Model name for embedding cache lookup (optional) */
  modelName?: string;

  // Callbacks
  /** Called after each batch of files is reindexed. Useful for testing. */
  onReindex?: (files: string[]) => void;
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
  package: string;
  relativePath: string;
  tsconfigPath: string;
}

/**
 * Resolve a file path to its package context.
 * Returns null if the file doesn't belong to any configured package.
 */
const resolveFileContext = (
  absolutePath: string,
  config: ProjectConfig,
  projectRoot: string,
): FileContext | null => {
  for (const pkg of config.packages) {
    const absoluteTsConfigPath = join(projectRoot, pkg.tsconfig);
    const packageRoot = dirname(absoluteTsConfigPath);

    if (absolutePath.startsWith(packageRoot)) {
      return {
        package: pkg.name,
        relativePath: relative(projectRoot, absolutePath),
        tsconfigPath: absoluteTsConfigPath,
      };
    }
  }
  return null;
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
    polling = false,
    pollingInterval = 1000,
    debounce: shouldDebounce = true,
    debounceInterval = 300,
    excludeDirectories = [],
    excludeFiles = [],
    logger,
    searchIndex,
    embeddingProvider,
    modelName,
    onReindex,
  } = options;

  const writer = createSqliteWriter(db);

  // Open embedding cache if model name is provided (kept open for watcher lifetime)
  const embeddingCache: EmbeddingCacheConnection | undefined =
    modelName !== undefined
      ? openEmbeddingCache(cacheDir, modelName)
      : undefined;
  const configuredPackageNames = extractConfiguredPackageNames(
    config,
    projectRoot,
  );

  // Create project registry for cross-package resolution
  const projectRegistry = createProjectRegistry(config, projectRoot);

  /**
   * Check if a file is part of the tsconfig compilation.
   */
  const isValidTsconfigFile = (
    tsconfigPath: string,
    absolutePath: string,
  ): boolean => {
    const project = projectRegistry.getProjectForTsConfig(tsconfigPath);
    if (!project) {
      return false;
    }
    if (project.getSourceFile(absolutePath)) {
      return true;
    }
    // New file: chokidar + resolveFileContext already filter by extension and package root
    return (
      !absolutePath.includes("node_modules") && !absolutePath.endsWith(".d.ts")
    );
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

    // Remove old data from both stores
    await writer.removeFileNodes(context.relativePath);
    if (searchIndex) {
      await searchIndex.removeByFile(context.relativePath);
    }

    // Create fresh Project for accurate import resolution (workspace-aware)
    const project = createProject({
      tsConfigFilePath: context.tsconfigPath,
      workspaceRoot: projectRoot,
      configuredPackageNames,
    });
    const sourceFile = project.addSourceFileAtPath(absolutePath);

    const extractionContext: EdgeExtractionContext = {
      filePath: context.relativePath,
      package: context.package,
      projectRegistry,
    };

    // Use shared indexFile function (writes to both DB and search index)
    const result = await indexFile(sourceFile, extractionContext, writer, {
      searchIndex,
      embeddingProvider,
      embeddingCache,
    });

    return result;
  };

  // Process a batch of changed files (accepts array from RxJS)
  const processBatch = async (files: string[]): Promise<void> => {
    const reindexedFiles: string[] = [];

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
          if (onReindex) {
            reindexedFiles.push(context.relativePath);
          }
          updateManifestEntry(manifest, context.relativePath, absolutePath);
          logger.success(
            `Reindexed ${context.relativePath} (${nodesAdded} nodes, ${edgesAdded} edges)`,
          );
        }
      } catch (error) {
        logger.error(
          `Error reindexing ${context.relativePath}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
    // Save manifest after processing batch
    saveManifest(cacheDir, manifest);

    // Notify callback if any files were reindexed
    if (onReindex && reindexedFiles.length > 0) {
      onReindex(reindexedFiles);
    }
  };

  // Handle file deletion
  const handleUnlink = async (relativePath: string): Promise<void> => {
    try {
      await writer.removeFileNodes(relativePath);
      if (searchIndex) {
        await searchIndex.removeByFile(relativePath);
      }
      removeManifestEntry(manifest, relativePath);
      saveManifest(cacheDir, manifest);
    } catch (error) {
      logger.error(
        `Error removing ${relativePath}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  };

  // RxJS Subject for file change events (used only in fs.watch + debounce mode)
  const fileChanges$ = new Subject<string>();
  let subscription: Subscription | null = null;

  // Set up RxJS debouncing pipeline (only if not polling and debounce is enabled)
  // When polling is true, polling inherently batches changes per poll cycle — no debouncing needed.
  if (!polling && shouldDebounce) {
    subscription = fileChanges$
      .pipe(bufferDebounce(debounceInterval))
      .subscribe((paths) => {
        processBatch(paths).catch((error) => {
          logger.error(
            `Batch processing error: ${error instanceof Error ? error.message : String(error)}`,
          );
        });
      });
  }

  // Build chokidar ignored patterns from excludeDirectories and excludeFiles
  const buildIgnoredPatterns = (): (
    | string
    | ((path: string, stats?: Stats) => boolean)
  )[] => {
    const patterns: (string | ((path: string, stats?: Stats) => boolean))[] =
      [];

    // Add exclusion globs
    for (const dir of excludeDirectories) {
      patterns.push(`**/${dir}/**`);
    }
    for (const file of excludeFiles) {
      patterns.push(file);
    }

    // Add the base filter function
    patterns.push((path: string, stats?: Stats): boolean => {
      // Always traverse directories, but skip node_modules
      if (!stats?.isFile()) {
        return path.includes("node_modules");
      }
      // Ignore .d.ts files and non-TypeScript files
      if (path.endsWith(".d.ts")) return true;
      return !path.endsWith(".ts") && !path.endsWith(".tsx");
    });

    return patterns;
  };

  // Initialize chokidar with exclusion patterns
  const watcher = watch(projectRoot, {
    ignored: buildIgnoredPatterns(),
    ignoreInitial: true, // Don't process existing files
    persistent: true,
    usePolling: polling, // chokidar uses usePolling, we expose as polling
    interval: polling ? pollingInterval : undefined,
  });

  // Create ready promise
  const readyPromise = new Promise<void>((resolve) => {
    watcher.once("ready", () => resolve());
  });

  // Handle file add/change events
  const handleFileChange = (absolutePath: string): void => {
    if (!polling && shouldDebounce) {
      // Debounce mode: emit to RxJS Subject for batching
      fileChanges$.next(absolutePath);
    } else {
      // Polling mode or no debounce: process immediately (polling batches inherently)
      processBatch([absolutePath]).catch((error) => {
        logger.error(
          `Processing error: ${error instanceof Error ? error.message : String(error)}`,
        );
      });
    }
  };

  watcher
    .on("add", handleFileChange)
    .on("change", handleFileChange)
    .on("unlink", (absolutePath) => {
      // Deletions are processed immediately (not debounced)
      const relativePath = relative(projectRoot, absolutePath);
      handleUnlink(relativePath);
    })
    .on("error", (error: unknown) => {
      logger.error(
        `Watcher error: ${error instanceof Error ? error.message : String(error)}`,
      );
    });

  return {
    async close(): Promise<void> {
      // Complete the Subject to flush any pending debounced events
      fileChanges$.complete();
      subscription?.unsubscribe();
      await watcher.close();
      // Close embedding cache
      embeddingCache?.close();
    },
    ready: readyPromise,
  };
};
