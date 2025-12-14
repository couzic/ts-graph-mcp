import type { Project, SourceFile } from "ts-morph";
import type { Edge, Node } from "../../db/Types.js";
import { extractEdges } from "./edges/extractEdges.js";
import { extractNodes } from "./nodes/extractNodes.js";
import type { NodeExtractionContext as ExtractionContext } from "./nodes/NodeExtractionContext.js";

export type { ExtractionContext };

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
