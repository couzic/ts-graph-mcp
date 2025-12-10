import { Project, type SourceFile } from "ts-morph";
import type { Edge, Node } from "../db/Types.js";
import { extractEdges } from "./EdgeExtractors.js";
import { type ExtractionContext, extractNodes } from "./NodeExtractors.js";

/**
 * Statistics from extraction.
 */
export interface ExtractionStats {
	/** File path that was processed */
	filePath: string;
	/** Number of nodes extracted */
	nodeCount: number;
	/** Number of edges extracted */
	edgeCount: number;
}

/**
 * Result from extracting a source file.
 */
export interface ExtractionResult {
	/** All extracted nodes */
	nodes: Node[];
	/** All extracted edges */
	edges: Edge[];
	/** Extraction statistics */
	stats: ExtractionStats;
}

/**
 * Extract all nodes and edges from a ts-morph SourceFile.
 *
 * @param sourceFile - ts-morph SourceFile to extract from
 * @param context - Extraction context (file path, module, package)
 * @returns Extraction result with nodes, edges, and stats
 */
export const extractFromSourceFile = (
	sourceFile: SourceFile,
	context: ExtractionContext,
): ExtractionResult => {
	// Extract nodes first
	const nodes = extractNodes(sourceFile, context);

	// Extract edges (needs nodes for CONTAINS edges)
	const edges = extractEdges(sourceFile, nodes, context);

	return {
		nodes,
		edges,
		stats: {
			filePath: context.filePath,
			nodeCount: nodes.length,
			edgeCount: edges.length,
		},
	};
};

/**
 * Options for extracting from a file path.
 */
export interface ExtractFromFileOptions {
	/** Existing ts-morph project to use (creates new if not provided) */
	project?: Project;
	/** tsconfig.json path (optional, for proper type resolution) */
	tsConfigFilePath?: string;
}

/**
 * Extract all nodes and edges from a file path.
 *
 * @param filePath - Absolute path to the TypeScript file
 * @param context - Extraction context (relative file path, module, package)
 * @param options - Extraction options
 * @returns Extraction result with nodes, edges, and stats
 */
export const extractFromFile = (
	filePath: string,
	context: ExtractionContext,
	options?: ExtractFromFileOptions,
): ExtractionResult => {
	const project =
		options?.project ??
		new Project({
			tsConfigFilePath: options?.tsConfigFilePath,
			skipAddingFilesFromTsConfig: true,
		});

	const sourceFile = project.addSourceFileAtPath(filePath);

	return extractFromSourceFile(sourceFile, context);
};
