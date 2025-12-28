import { dirname, join, relative } from "node:path";
import type Database from "better-sqlite3";
import type { ProjectConfig } from "../config/Config.schemas.js";
import { createSqliteWriter } from "../db/sqlite/createSqliteWriter.js";
import { createProject } from "./createProject.js";
import type { NodeExtractionContext } from "./extract/nodes/NodeExtractionContext.js";
import { indexFile } from "./indexFile.js";
import {
  compareManifest,
  type IndexManifest,
  saveManifest,
  updateManifestEntry,
} from "./manifest.js";

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
  module: string;
  package: string;
  tsconfigPath: string;
}

/**
 * Build a map of relative file paths to their module/package context.
 * Uses ts-morph to discover files from tsconfig, same as indexProject.
 */
const buildFileContextMap = (
  config: ProjectConfig,
  projectRoot: string,
): Map<string, FileContext> => {
  const contextMap = new Map<string, FileContext>();

  for (const module of config.modules) {
    for (const pkg of module.packages) {
      const absoluteTsConfigPath = join(projectRoot, pkg.tsconfig);
      const packageRoot = dirname(absoluteTsConfigPath);

      // Create ts-morph project to discover files from tsconfig (supports Yarn PnP)
      const project = createProject({
        tsConfigFilePath: absoluteTsConfigPath,
      });

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
          module: module.name,
          package: pkg.name,
          tsconfigPath: absoluteTsConfigPath,
        });
      }
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
  },
): Promise<SyncOnStartupResult> => {
  const startTime = Date.now();
  const errors: Array<{ file: string; message: string }> = [];
  const writer = createSqliteWriter(db);

  // Build context map for all configured files
  const fileContextMap = buildFileContextMap(config, options.projectRoot);
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
      await writer.removeFileNodes(relativePath);
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
    if (!context) continue;

    const existing = filesByTsconfig.get(context.tsconfigPath) ?? [];
    existing.push(relativePath);
    filesByTsconfig.set(context.tsconfigPath, existing);
  }

  // Process each tsconfig group
  for (const [tsconfigPath, files] of filesByTsconfig) {
    const project = createProject({
      tsConfigFilePath: tsconfigPath,
    });

    for (const relativePath of files) {
      const context = fileContextMap.get(relativePath);
      if (!context) continue;

      const absolutePath = join(options.projectRoot, relativePath);

      try {
        // Remove old data
        await writer.removeFileNodes(relativePath);

        // Add and parse file
        const sourceFile = project.addSourceFileAtPath(absolutePath);

        const extractionContext: NodeExtractionContext = {
          filePath: relativePath,
          module: context.module,
          package: context.package,
        };

        // Use shared indexFile function
        await indexFile(sourceFile, extractionContext, writer);

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

  // Save updated manifest
  saveManifest(options.cacheDir, manifest);

  return {
    staleCount: stale.length,
    deletedCount: deleted.length,
    addedCount: added.length,
    durationMs: Date.now() - startTime,
    errors: errors.length > 0 ? errors : undefined,
  };
};
