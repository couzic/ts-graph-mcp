import { dirname, join, relative } from "node:path";
import type Database from "better-sqlite3";
import type { ProjectConfig } from "../config/Config.schemas.js";
import { createSqliteWriter } from "../db/sqlite/createSqliteWriter.js";
import type { EmbeddingProvider } from "../embedding/EmbeddingTypes.js";
import { openEmbeddingCache } from "../embedding/embeddingCache.js";
import type { TsGraphLogger } from "../logging/TsGraphLogger.js";
import type { SearchIndexWrapper } from "../search/createSearchIndex.js";
import type { EdgeExtractionContext } from "./extract/edges/EdgeExtractionContext.js";
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
 * 1. Compare manifest with current filesystem state
 * 2. Remove nodes/edges for deleted files
 * 3. Reindex stale and new files
 * 4. Update manifest
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

  // Create project registry for cross-package resolution
  const projectRegistry = createProjectRegistry(config, options.projectRoot);

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
  if (filesToReindex.length > 0) {
    logger.startProgress(filesToReindex.length, "sync");
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
        };

        // Use shared indexFile function (writes to both DB and search index)
        const result = await indexFile(sourceFile, extractionContext, writer, {
          searchIndex: options.searchIndex,
          embeddingProvider: options.embeddingProvider,
          embeddingCache,
        });
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
  if (filesToReindex.length > 0) {
    logger.completeProgress(filesReindexed, nodesAdded);
  }

  // Save updated manifest
  saveManifest(options.cacheDir, manifest);

  // Close embedding cache
  embeddingCache?.close();

  return {
    staleCount: stale.length,
    deletedCount: deleted.length,
    addedCount: added.length,
    durationMs: Date.now() - startTime,
    errors: errors.length > 0 ? errors : undefined,
  };
};
