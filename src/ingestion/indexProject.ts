import { dirname, join, relative } from "node:path";
import type { ProjectConfig } from "../config/Config.schemas.js";
import type { DbWriter } from "../db/DbWriter.js";
import type { IndexResult } from "../db/Types.js";
import { createProject } from "./createProject.js";
import type { NodeExtractionContext } from "./extract/nodes/NodeExtractionContext.js";
import { indexFile } from "./indexFile.js";

/**
 * Options for indexing an entire project.
 */
export interface IndexProjectOptions {
  /** Project root directory (for resolving relative paths) */
  projectRoot: string;
  /** Clear database before indexing */
  clearFirst?: boolean;
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

  // Process each package, streaming nodes and edges to DB
  for (const module of config.modules) {
    for (const pkg of module.packages) {
      try {
        const result = await processPackage(
          module.name,
          pkg.name,
          pkg.tsconfig,
          options.projectRoot,
          dbWriter,
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
  moduleName: string,
  packageName: string,
  tsconfigPath: string,
  projectRoot: string,
  dbWriter: DbWriter,
): Promise<PackageProcessResult> => {
  const errors: Array<{ file: string; message: string }> = [];
  const filesIndexed: string[] = [];
  let filesProcessed = 0;
  let nodesAdded = 0;
  let edgesAdded = 0;

  const absoluteTsConfigPath = join(projectRoot, tsconfigPath);
  const packageRoot = dirname(absoluteTsConfigPath);

  // Create ts-morph project with tsconfig (supports Yarn PnP if detected)
  const project = createProject({
    tsConfigFilePath: absoluteTsConfigPath,
  });

  // Filter source files:
  // - Only include files within this package's directory tree
  // - Skip node_modules and .d.ts files
  //
  // This prevents files from other packages (pulled in via imports) from
  // being extracted with wrong module/package metadata. Each package
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

  // Process each file using shared indexFile()
  for (const sourceFile of sourceFiles) {
    const absolutePath = sourceFile.getFilePath();
    const relativePath = relative(projectRoot, absolutePath);
    const context: NodeExtractionContext = {
      filePath: relativePath,
      module: moduleName,
      package: packageName,
    };

    try {
      const result = await indexFile(sourceFile, context, dbWriter);
      nodesAdded += result.nodesAdded;
      edgesAdded += result.edgesAdded;
      filesProcessed++;
      filesIndexed.push(relativePath);
    } catch (e) {
      errors.push({
        file: relativePath,
        message: `File processing failed: ${(e as Error).message}`,
      });
    }
  }

  return {
    filesProcessed,
    filesIndexed,
    nodesAdded,
    edgesAdded,
    errors: errors.length > 0 ? errors : undefined,
  };
};
