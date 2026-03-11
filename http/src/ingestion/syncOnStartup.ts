import { existsSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import type Database from "better-sqlite3";
import type { ProjectConfig } from "../config/Config.schemas.js";
import type { DbWriter } from "../db/DbWriter.js";
import { createSqliteWriter } from "../db/sqlite/createSqliteWriter.js";
import type { EmbeddingProvider } from "../embedding/EmbeddingTypes.js";
import {
  type EmbeddingCacheConnection,
  openEmbeddingCache,
} from "../embedding/embeddingCache.js";
import type { TsGraphLogger } from "../logging/TsGraphLogger.js";
import type { SearchIndexWrapper } from "../search/createSearchIndex.js";
import type { EdgeExtractionContext } from "./extract/edges/EdgeExtractionContext.js";
import { parseFeatureFile } from "./extract/specs/parseFeatureFile.js";
import {
  findFeatureFiles,
  reindexFeatureFile,
} from "./indexFeatureFiles.js";
import { indexFile } from "./indexFile.js";
import {
  compareManifest,
  type IndexManifest,
  saveManifest,
  updateManifestEntry,
} from "./manifest.js";
import {
  createProjectRegistry,
  type ProjectRegistry,
} from "./ProjectRegistry.js";

/**
 * Result of startup sync operation.
 */
export interface SyncOnStartupResult {
  /** Number of stale files reindexed */
  staleCount: number;
  /** Number of deleted files cleaned up */
  deletedCount: number;
  /** Number of new files indexed */
  addedCount: number;
  /** Duration in milliseconds */
  durationMs: number;
  /** Errors encountered during sync */
  errors?: Array<{ file: string; message: string }>;
}

/**
 * File context for extraction.
 */
interface FileContext {
  package: string;
  tsconfigPath: string;
}

/**
 * Build a map of relative file paths to their package context.
 * Reuses ts-morph Projects from the registry to avoid redundant project creation.
 */
const buildFileContextMap = (
  config: ProjectConfig,
  projectRoot: string,
  projectRegistry: ProjectRegistry,
): Map<string, FileContext> => {
  const contextMap = new Map<string, FileContext>();

  for (const pkg of config.packages) {
    const absoluteTsConfigPath = join(projectRoot, pkg.tsconfig);
    const packageRoot = dirname(absoluteTsConfigPath);

    const project = projectRegistry.getProjectForTsConfig(absoluteTsConfigPath);
    if (!project) {
      continue;
    }

    // Filter source files like indexProject does
    const sourceFiles = project.getSourceFiles().filter((sf) => {
      const absolutePath = sf.getFilePath();
      if (!absolutePath.startsWith(packageRoot)) {
        return false;
      }
      return (
        !absolutePath.includes("node_modules") &&
        !absolutePath.includes("/.claude/worktrees/") &&
        !absolutePath.endsWith(".d.ts")
      );
    });

    for (const sourceFile of sourceFiles) {
      const absolutePath = sourceFile.getFilePath();
      const relativePath = relative(projectRoot, absolutePath);
      contextMap.set(relativePath, {
        package: pkg.name,
        tsconfigPath: absoluteTsConfigPath,
      });
    }
  }

  return contextMap;
};

/**
 * Sync the database with the filesystem on startup.
 *
 * @spec indexing::sync.manifest-detection
 * @spec indexing::sync.stale-reindex
 * @spec indexing::sync.deleted-cleanup
 * @spec indexing::sync.new-files
 *
 * 1. Sync feature files (specs/) first to build specIdMap
 * 2. Compare manifest with current filesystem state
 * 3. Remove nodes/edges for deleted files
 * 4. Reindex stale and new files (with specIdMap for @spec edges)
 * 5. Update manifest
 */
export const syncOnStartup = async (
  db: Database.Database,
  config: ProjectConfig,
  manifest: IndexManifest,
  options: {
    projectRoot: string;
    cacheDir: string;
    logger: TsGraphLogger;
    searchIndex?: SearchIndexWrapper;
    embeddingProvider: EmbeddingProvider;
    /** Model name for embedding cache lookup */
    modelName?: string;
  },
): Promise<SyncOnStartupResult> => {
  const startTime = Date.now();
  const errors: Array<{ file: string; message: string }> = [];
  const writer = createSqliteWriter(db);

  // Open embedding cache if model name is provided
  const embeddingCache =
    options.modelName !== undefined
      ? openEmbeddingCache(options.cacheDir, options.modelName)
      : undefined;

  const embeddingOptions = {
    searchIndex: options.searchIndex,
    embeddingProvider: options.embeddingProvider,
    embeddingCache,
  };

  // Create project registry for cross-package resolution
  const projectRegistry = createProjectRegistry(config, options.projectRoot);

  // --- Feature file sync ---
  const featureFileSync = await syncFeatureFiles(
    options.projectRoot,
    manifest,
    writer,
    embeddingOptions,
    errors,
  );

  const { specIdMap } = featureFileSync;

  // --- TS file sync ---
  // Build context map for all configured files
  const fileContextMap = buildFileContextMap(
    config,
    options.projectRoot,
    projectRegistry,
  );
  const currentFiles = Array.from(fileContextMap.keys());

  // Compare manifest with filesystem
  const { stale, deleted, added } = compareManifest(
    manifest,
    currentFiles,
    options.projectRoot,
  );

  // Remove deleted files
  for (const relativePath of deleted) {
    try {
      await writer.deleteFile(relativePath);
      if (options.searchIndex) {
        await options.searchIndex.removeByFile(relativePath);
      }
      delete manifest.files[relativePath];
    } catch (error) {
      errors.push({
        file: relativePath,
        message: `Failed to remove: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  }

  // Reindex stale and new files
  const filesToReindex = [...stale, ...added];

  // Group files by tsconfig for efficient ts-morph project reuse
  const filesByTsconfig = new Map<string, string[]>();
  for (const relativePath of filesToReindex) {
    const context = fileContextMap.get(relativePath);
    if (!context) {
      continue;
    }

    const existing = filesByTsconfig.get(context.tsconfigPath) ?? [];
    existing.push(relativePath);
    filesByTsconfig.set(context.tsconfigPath, existing);
  }

  // Start progress tracking for sync
  const { logger } = options;
  let filesReindexed = 0;
  let nodesAdded = 0;
  const totalToReindex = filesToReindex.length + featureFileSync.reindexed;
  if (totalToReindex > 0) {
    logger.startProgress(totalToReindex, "sync");
    // Account for already-processed feature files
    filesReindexed += featureFileSync.reindexed;
    nodesAdded += featureFileSync.nodesAdded;
    if (featureFileSync.reindexed > 0) {
      logger.updateProgress(filesReindexed);
    }
  }

  // Process each tsconfig group
  for (const [tsconfigPath, files] of filesByTsconfig) {
    const project = projectRegistry.getProjectForTsConfig(tsconfigPath);
    if (!project) {
      continue;
    }

    for (const relativePath of files) {
      const context = fileContextMap.get(relativePath);
      if (!context) {
        continue;
      }

      const absolutePath = join(options.projectRoot, relativePath);

      try {
        // Remove old data from both stores
        await writer.removeFileNodes(relativePath);
        if (options.searchIndex) {
          await options.searchIndex.removeByFile(relativePath);
        }

        // Add and parse file
        const sourceFile = project.addSourceFileAtPath(absolutePath);

        const extractionContext: EdgeExtractionContext = {
          filePath: relativePath,
          package: context.package,
          projectRegistry,
          specIdMap,
        };

        // Use shared indexFile function (writes to both DB and search index)
        const result = await indexFile(sourceFile, extractionContext, writer, embeddingOptions);
        filesReindexed++;
        nodesAdded += result.nodesAdded;

        // Update progress
        logger.updateProgress(filesReindexed);

        // Update manifest
        updateManifestEntry(manifest, relativePath, absolutePath);
      } catch (error) {
        errors.push({
          file: relativePath,
          message: `Failed to reindex: ${error instanceof Error ? error.message : String(error)}`,
        });
      }
    }
  }

  // Complete progress
  if (totalToReindex > 0) {
    logger.completeProgress(filesReindexed, nodesAdded);
  }

  // Save updated manifest
  saveManifest(options.cacheDir, manifest);

  // Close embedding cache
  embeddingCache?.close();

  return {
    staleCount: stale.length + featureFileSync.stale,
    deletedCount: deleted.length + featureFileSync.deleted,
    addedCount: added.length + featureFileSync.added,
    durationMs: Date.now() - startTime,
    errors: errors.length > 0 ? errors : undefined,
  };
};

/**
 * Sync feature files (specs/) with the manifest and DB.
 * Returns counts for reporting and a specIdMap built from all current feature files.
 */
const syncFeatureFiles = async (
  projectRoot: string,
  manifest: IndexManifest,
  writer: DbWriter,
  embeddingOptions: {
    searchIndex?: SearchIndexWrapper;
    embeddingProvider: EmbeddingProvider;
    embeddingCache?: EmbeddingCacheConnection;
  },
  errors: Array<{ file: string; message: string }>,
): Promise<{
  stale: number;
  deleted: number;
  added: number;
  reindexed: number;
  nodesAdded: number;
  specIdMap: Map<string, string>;
}> => {
  const specIdMap = new Map<string, string>();
  const specsDir = join(projectRoot, "specs");
  if (!existsSync(specsDir)) {
    return { stale: 0, deleted: 0, added: 0, reindexed: 0, nodesAdded: 0, specIdMap };
  }

  // Discover current feature files
  const currentFeatureFiles = findFeatureFiles(specsDir).map((abs) =>
    relative(projectRoot, abs),
  );

  // Find feature files tracked in manifest
  const manifestFeatureFiles = Object.keys(manifest.files).filter((f) =>
    f.endsWith(".feature.md"),
  );

  // Compare with manifest
  const { stale, deleted, added } = compareManifest(
    { version: 1, files: pickKeys(manifest.files, manifestFeatureFiles) },
    currentFeatureFiles,
    projectRoot,
  );

  // Delete removed feature files
  for (const relativePath of deleted) {
    try {
      await writer.deleteFile(relativePath);
      if (embeddingOptions.searchIndex) {
        await embeddingOptions.searchIndex.removeByFile(relativePath);
      }
      delete manifest.files[relativePath];
    } catch (error) {
      errors.push({
        file: relativePath,
        message: `Failed to remove feature file: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  }

  // Reindex stale and new feature files
  const filesToReindex = [...stale, ...added];
  const reindexedSet = new Set(filesToReindex);
  let reindexed = 0;
  let nodesAdded = 0;

  for (const relativePath of filesToReindex) {
    const absolutePath = join(projectRoot, relativePath);
    try {
      // Remove old data
      await writer.removeFileNodes(relativePath);
      if (embeddingOptions.searchIndex) {
        await embeddingOptions.searchIndex.removeByFile(relativePath);
      }

      const result = await reindexFeatureFile(
        absolutePath,
        relativePath,
        writer,
        embeddingOptions,
      );
      nodesAdded += result.nodesAdded;
      reindexed++;

      for (const [key, value] of result.specEntries) {
        specIdMap.set(key, value);
      }

      updateManifestEntry(manifest, relativePath, absolutePath);
    } catch (error) {
      errors.push({
        file: relativePath,
        message: `Failed to reindex feature file: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  }

  // Parse unchanged feature files to populate specIdMap
  const deletedSet = new Set(deleted);
  for (const relativePath of currentFeatureFiles) {
    if (reindexedSet.has(relativePath) || deletedSet.has(relativePath)) {
      continue;
    }
    const absolutePath = join(projectRoot, relativePath);
    const content = readFileSync(absolutePath, "utf-8");
    const parsed = parseFeatureFile(content, relativePath);
    for (const spec of parsed.specs) {
      specIdMap.set(spec.name, spec.id);
    }
  }

  return { stale: stale.length, deleted: deleted.length, added: added.length, reindexed, nodesAdded, specIdMap };
};

/**
 * Pick only the specified keys from a record.
 */
const pickKeys = <T>(
  record: Record<string, T>,
  keys: string[],
): Record<string, T> => {
  const result: Record<string, T> = {};
  for (const key of keys) {
    if (key in record) {
      result[key] = record[key]!;
    }
  }
  return result;
};
