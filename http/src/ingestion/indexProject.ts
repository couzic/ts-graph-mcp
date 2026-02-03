import { cpus } from "node:os";
import { dirname, relative, resolve } from "node:path";
import { from, lastValueFrom } from "rxjs";
import { mergeMap, tap, toArray } from "rxjs/operators";
import type { ProjectConfig } from "../config/Config.schemas.js";
import type { DbWriter } from "../db/DbWriter.js";
import type { IndexResult } from "../db/Types.js";
import type { EmbeddingProvider } from "../embedding/EmbeddingTypes.js";
import { openEmbeddingCache } from "../embedding/embeddingCache.js";
import type { TsGraphLogger } from "../logging/TsGraphLogger.js";
import type { SearchIndexWrapper } from "../search/createSearchIndex.js";
import { createProject } from "./createProject.js";
import type { EdgeExtractionContext } from "./extract/edges/EdgeExtractionContext.js";
import { extractConfiguredPackageNames } from "./extractConfiguredPackageNames.js";
import type { EmbeddingCache } from "./indexFile.js";
import { indexFile } from "./indexFile.js";
import {
  createProjectRegistry,
  type ProjectRegistry,
} from "./ProjectRegistry.js";

/** Default concurrency based on CPU cores (minimum 2) */
const DEFAULT_CONCURRENCY = Math.max(2, cpus().length);

/**
 * Options for indexing an entire project.
 */
export interface IndexProjectOptions {
  /** Project root directory (for resolving relative paths) */
  projectRoot: string;
  /** Cache directory (for embedding cache, required when using embeddingProvider) */
  cacheDir?: string;
  /** Embedding model name (for cache file naming, required when using embeddingProvider) */
  modelName?: string;
  /** Clear database before indexing */
  clearFirst?: boolean;
  /** Logger for progress reporting */
  logger: TsGraphLogger;
  /** Search index for unified indexing (optional) */
  searchIndex?: SearchIndexWrapper;
  /** Embedding provider for semantic search (optional) */
  embeddingProvider?: EmbeddingProvider;
}

/**
 * Index an entire project based on config.
 * Parses all packages defined in config.
 *
 * Streams nodes and edges to the database per-file:
 * - For each file: extract nodes → write to DB → extract edges → write to DB
 * - No global accumulation needed since edge extractors use buildImportMap
 * - Queries use JOINs to filter dangling edges, no pre-filtering required
 *
 * @param config - Project configuration
 * @param dbWriter - Database writer instance
 * @param options - Index options
 * @returns Indexing statistics
 */
export const indexProject = async (
  config: ProjectConfig,
  dbWriter: DbWriter,
  options: IndexProjectOptions,
): Promise<IndexResult> => {
  const startTime = Date.now();
  const errors: Array<{ file: string; message: string }> = [];
  const filesIndexed: string[] = [];
  let filesProcessed = 0;
  let nodesAdded = 0;
  let edgesAdded = 0;

  // Clear database if requested
  if (options.clearFirst) {
    await dbWriter.clearAll();
  }

  // Open embedding cache connection (only when cacheDir and modelName are provided)
  const { cacheDir, modelName } = options;
  const embeddingCache =
    cacheDir !== undefined && modelName !== undefined
      ? openEmbeddingCache(cacheDir, modelName)
      : undefined;

  // Create project registry for cross-package resolution
  const projectRegistry = createProjectRegistry(config, options.projectRoot);
  const configuredPackageNames = extractConfiguredPackageNames(
    config,
    options.projectRoot,
  );

  // Process each package, streaming nodes and edges to DB
  for (const pkg of config.packages) {
    try {
      const result = await processPackage(
        pkg.name,
        pkg.tsconfig,
        options.projectRoot,
        dbWriter,
        projectRegistry,
        configuredPackageNames,
        options.logger,
        options.searchIndex,
        options.embeddingProvider,
        embeddingCache,
      );

      filesProcessed += result.filesProcessed;
      nodesAdded += result.nodesAdded;
      edgesAdded += result.edgesAdded;
      filesIndexed.push(...result.filesIndexed);

      if (result.errors) {
        errors.push(...result.errors);
      }
    } catch (e) {
      errors.push({
        file: pkg.tsconfig,
        message: `Failed to process package: ${(e as Error).message}`,
      });
    }
  }

  // Close embedding cache connection
  if (embeddingCache !== undefined) {
    embeddingCache.close();
  }

  return {
    filesProcessed,
    filesIndexed,
    nodesAdded,
    edgesAdded,
    durationMs: Date.now() - startTime,
    errors: errors.length > 0 ? errors : undefined,
  };
};

/**
 * Result from processing a package (extracting and writing nodes/edges).
 */
interface PackageProcessResult {
  filesProcessed: number;
  filesIndexed: string[];
  nodesAdded: number;
  edgesAdded: number;
  errors?: Array<{ file: string; message: string }>;
}

/**
 * Process a single package by streaming nodes and edges to the database.
 *
 * For each file:
 * 1. Extract nodes → write to DB
 * 2. Extract edges → write to DB
 *
 * No global accumulation - edge extractors use buildImportMap for cross-file resolution.
 *
 * Memory efficiency: O(1) per file (~100MB peak regardless of project size).
 * Each file's import map contains ~100 entries max vs millions if we held all nodes.
 */
const processPackage = async (
  packageName: string,
  tsconfigPath: string,
  projectRoot: string,
  dbWriter: DbWriter,
  projectRegistry: ProjectRegistry,
  configuredPackageNames: Set<string>,
  logger: TsGraphLogger,
  searchIndex: SearchIndexWrapper | undefined,
  embeddingProvider: EmbeddingProvider | undefined,
  embeddingCache: EmbeddingCache | undefined,
): Promise<PackageProcessResult> => {
  const errors: Array<{ file: string; message: string }> = [];
  const filesIndexed: string[] = [];
  let filesProcessed = 0;
  let nodesAdded = 0;
  let edgesAdded = 0;

  const absoluteTsConfigPath = resolve(projectRoot, tsconfigPath);
  const packageRoot = dirname(absoluteTsConfigPath);

  // Create ts-morph project with tsconfig (workspace-aware resolution)
  const project = createProject({
    tsConfigFilePath: absoluteTsConfigPath,
    workspaceRoot: projectRoot,
    configuredPackageNames,
  });

  // Filter source files:
  // - Only include files within this package's directory tree
  // - Skip node_modules and .d.ts files
  //
  // This prevents files from other packages (pulled in via imports) from
  // being extracted with wrong package metadata. Each package
  // should only extract its own files.
  const sourceFiles = project.getSourceFiles().filter((sf) => {
    const absolutePath = sf.getFilePath();
    // Only include files within this package's directory
    if (!absolutePath.startsWith(packageRoot)) {
      return false;
    }
    return (
      !absolutePath.includes("node_modules") && !absolutePath.endsWith(".d.ts")
    );
  });

  // Start progress tracking for this package
  logger.startProgress(sourceFiles.length, packageName);

  // Process files with controlled concurrency using RxJS
  const results = await lastValueFrom(
    from(sourceFiles).pipe(
      mergeMap(async (sourceFile) => {
        const absolutePath = sourceFile.getFilePath();
        const relativePath = relative(projectRoot, absolutePath);
        const context: EdgeExtractionContext = {
          filePath: relativePath,
          package: packageName,
          projectRegistry,
        };

        try {
          const result = await indexFile(sourceFile, context, dbWriter, {
            searchIndex,
            embeddingProvider,
            embeddingCache,
          });
          return {
            success: true as const,
            relativePath,
            nodesAdded: result.nodesAdded,
            edgesAdded: result.edgesAdded,
          };
        } catch (e) {
          const message = `Failed to index ${relativePath}: ${(e as Error).message}`;
          logger.error(message);
          return {
            success: false as const,
            relativePath,
            message,
          };
        }
      }, DEFAULT_CONCURRENCY),
      tap(() => {
        filesProcessed++;
        logger.updateProgress(filesProcessed);
      }),
      toArray(),
    ),
    { defaultValue: [] },
  );

  // Aggregate results
  for (const result of results) {
    if (result.success) {
      nodesAdded += result.nodesAdded;
      edgesAdded += result.edgesAdded;
      filesIndexed.push(result.relativePath);
    } else {
      errors.push({
        file: result.relativePath,
        message: result.message,
      });
    }
  }

  // Complete progress for this package
  logger.completeProgress(filesProcessed, nodesAdded);

  return {
    filesProcessed,
    filesIndexed,
    nodesAdded,
    edgesAdded,
    errors: errors.length > 0 ? errors : undefined,
  };
};
