import { dirname, join, relative } from "node:path";
import { Project } from "ts-morph";
import type { ProjectConfig } from "../config/ConfigSchema.js";
import type { DbWriter } from "../db/DbWriter.js";
import type { Edge, IndexResult, Node } from "../db/Types.js";
import { extractFromSourceFile } from "./extract/extractFromSourceFile.js";
import type { NodeExtractionContext as ExtractionContext } from "./extract/nodes/NodeExtractionContext.js";

/**
 * Options for indexing a single file.
 */
export interface IndexFileOptions {
	/** Module name */
	module: string;
	/** Package name */
	package: string;
	/** Relative file path (used for node IDs) */
	relativePath: string;
	/** Existing ts-morph project (optional) */
	project?: Project;
}

/**
 * Index a single file.
 * Used for incremental updates.
 * Automatically removes old data for the file first.
 *
 * @param filePath - Absolute path to the file
 * @param dbWriter - Database writer instance
 * @param options - Index options
 */
export const indexFile = async (
	filePath: string,
	dbWriter: DbWriter,
	options: IndexFileOptions,
): Promise<void> => {
	// Remove existing data for this file
	await dbWriter.removeFileNodes(options.relativePath);

	// Create or reuse project
	const project =
		options.project ??
		new Project({
			skipAddingFilesFromTsConfig: true,
		});

	const sourceFile = project.addSourceFileAtPath(filePath);

	const context: ExtractionContext = {
		filePath: options.relativePath,
		module: options.module,
		package: options.package,
	};

	const result = extractFromSourceFile(sourceFile, context);

	// Write to database
	await dbWriter.addNodes(result.nodes);
	await dbWriter.addEdges(result.edges);
};

/**
 * Remove a file from the index.
 * Used when a file is deleted.
 *
 * @param filePath - Relative file path
 * @param dbWriter - Database writer instance
 */
export const removeFile = async (
	filePath: string,
	dbWriter: DbWriter,
): Promise<void> => {
	await dbWriter.removeFileNodes(filePath);
};

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
	let filesProcessed = 0;
	let totalNodes = 0;
	let totalEdges = 0;

	// Clear database if requested
	if (options.clearFirst) {
		await dbWriter.clearAll();
	}

	// Process each module
	for (const module of config.modules) {
		// Process each package in the module
		for (const pkg of module.packages) {
			try {
				const result = await indexPackage(
					module.name,
					pkg.name,
					pkg.tsconfig,
					options.projectRoot,
					dbWriter,
				);

				filesProcessed += result.filesProcessed;
				totalNodes += result.nodesAdded;
				totalEdges += result.edgesAdded;

				if (result.errors) {
					errors.push(...result.errors);
				}
			} catch (e) {
				errors.push({
					file: pkg.tsconfig,
					message: `Failed to index package: ${(e as Error).message}`,
				});
			}
		}
	}

	return {
		filesProcessed,
		nodesAdded: totalNodes,
		edgesAdded: totalEdges,
		durationMs: Date.now() - startTime,
		errors: errors.length > 0 ? errors : undefined,
	};
};

/**
 * Index a single package.
 *
 * Uses two-pass approach to handle cross-file edges:
 * 1. Extract all files, collecting nodes and edges in memory
 * 2. Insert all nodes first, then all edges
 *
 * This ensures target nodes exist before edges reference them,
 * avoiding foreign key constraint failures.
 */
const indexPackage = async (
	moduleName: string,
	packageName: string,
	tsconfigPath: string,
	projectRoot: string,
	dbWriter: DbWriter,
): Promise<IndexResult> => {
	const startTime = Date.now();
	const errors: Array<{ file: string; message: string }> = [];
	let filesProcessed = 0;
	let totalNodes = 0;
	let totalEdges = 0;

	const absoluteTsConfigPath = join(projectRoot, tsconfigPath);
	const _packageRoot = dirname(absoluteTsConfigPath);

	// Create ts-morph project with tsconfig
	const project = new Project({
		tsConfigFilePath: absoluteTsConfigPath,
	});

	const sourceFiles = project.getSourceFiles();

	// Pass 1: Extract all files, collect nodes and edges
	const allNodes: Node[] = [];
	const allEdges: Edge[] = [];

	for (const sourceFile of sourceFiles) {
		const absolutePath = sourceFile.getFilePath();

		// Skip node_modules and declaration files
		if (
			absolutePath.includes("node_modules") ||
			absolutePath.endsWith(".d.ts")
		) {
			continue;
		}

		try {
			// Calculate relative path from project root
			const relativePath = relative(projectRoot, absolutePath);

			const context: ExtractionContext = {
				filePath: relativePath,
				module: moduleName,
				package: packageName,
			};

			const result = extractFromSourceFile(sourceFile, context);

			allNodes.push(...result.nodes);
			allEdges.push(...result.edges);

			filesProcessed++;
			totalNodes += result.stats.nodeCount;
			totalEdges += result.stats.edgeCount;
		} catch (e) {
			errors.push({
				file: absolutePath,
				message: (e as Error).message,
			});
		}
	}

	// Pass 2: Insert all nodes first, then all edges
	// This ensures target nodes exist before edges reference them
	try {
		await dbWriter.addNodes(allNodes);

		// Filter out edges with dangling targets (e.g., imported types from external modules)
		// These edges reference nodes that don't exist because we skip node_modules
		const nodeIds = new Set(allNodes.map((n) => n.id));
		const validEdges = allEdges.filter(
			(e) => nodeIds.has(e.source) && nodeIds.has(e.target),
		);

		await dbWriter.addEdges(validEdges);
	} catch (e) {
		errors.push({
			file: tsconfigPath,
			message: `Failed to write to database: ${(e as Error).message}`,
		});
	}

	return {
		filesProcessed,
		nodesAdded: totalNodes,
		edgesAdded: totalEdges,
		durationMs: Date.now() - startTime,
		errors: errors.length > 0 ? errors : undefined,
	};
};
