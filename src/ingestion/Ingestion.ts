import { dirname, join, relative } from "node:path";
import { Project, type SourceFile } from "ts-morph";
import type { ProjectConfig } from "../config/ConfigSchema.js";
import type { DbWriter } from "../db/DbWriter.js";
import type { Edge, IndexResult, Node } from "../db/Types.js";
import { extractEdges } from "./extract/edges/extractEdges.js";
import { extractNodes } from "./extract/nodes/extractNodes.js";
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
 * Uses three-pass approach to handle cross-file edges:
 * 1. Extract nodes from all files
 * 2. Extract edges from all files (with ALL nodes available for cross-file resolution)
 * 3. Insert all nodes first, then all edges
 *
 * This ensures:
 * - Cross-file CALLS edges can be resolved (buildSymbolMap sees all nodes)
 * - Target nodes exist before edges reference them (FK safety)
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

	const absoluteTsConfigPath = join(projectRoot, tsconfigPath);
	const _packageRoot = dirname(absoluteTsConfigPath);

	// Create ts-morph project with tsconfig
	const project = new Project({
		tsConfigFilePath: absoluteTsConfigPath,
	});

	// Filter source files (skip node_modules and .d.ts)
	const sourceFiles = project.getSourceFiles().filter((sf) => {
		const absolutePath = sf.getFilePath();
		return (
			!absolutePath.includes("node_modules") && !absolutePath.endsWith(".d.ts")
		);
	});

	// Build contexts for each file
	const fileContexts: Array<{
		sourceFile: SourceFile;
		context: ExtractionContext;
	}> = [];
	for (const sourceFile of sourceFiles) {
		const absolutePath = sourceFile.getFilePath();
		const relativePath = relative(projectRoot, absolutePath);
		fileContexts.push({
			sourceFile,
			context: {
				filePath: relativePath,
				module: moduleName,
				package: packageName,
			},
		});
	}

	// Pass 1: Extract nodes from all files
	const allNodes: Node[] = [];
	for (const { sourceFile, context } of fileContexts) {
		try {
			const nodes = extractNodes(sourceFile, context);
			allNodes.push(...nodes);
		} catch (e) {
			errors.push({
				file: context.filePath,
				message: `Node extraction failed: ${(e as Error).message}`,
			});
		}
	}

	// Pass 2: Extract edges from all files (with ALL nodes for cross-file resolution)
	const allEdges: Edge[] = [];
	for (const { sourceFile, context } of fileContexts) {
		try {
			const edges = extractEdges(sourceFile, allNodes, context);
			allEdges.push(...edges);
		} catch (e) {
			errors.push({
				file: context.filePath,
				message: `Edge extraction failed: ${(e as Error).message}`,
			});
		}
	}

	// Pass 3: Insert all nodes first, then all edges
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
		filesProcessed: fileContexts.length,
		nodesAdded: allNodes.length,
		edgesAdded: allEdges.length,
		durationMs: Date.now() - startTime,
		errors: errors.length > 0 ? errors : undefined,
	};
};
