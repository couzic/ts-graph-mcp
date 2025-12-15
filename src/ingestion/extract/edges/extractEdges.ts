import type { SourceFile } from "ts-morph";
import type { Edge, Node } from "../../../db/Types.js";
import type { EdgeExtractionContext } from "./EdgeExtractionContext.js";
import { extractCallEdges } from "./extractCallEdges.js";
import { extractContainsEdges } from "./extractContainsEdges.js";
import { extractImportEdges } from "./extractImportEdges.js";
import { extractInheritanceEdges } from "./extractInheritanceEdges.js";
import { extractTypeUsageEdges } from "./extractTypeUsageEdges.js";

export type { EdgeExtractionContext };

/**
 * Extract all edges from a source file (given already-extracted nodes).
 */
export const extractEdges = (
	sourceFile: SourceFile,
	nodes: Node[],
	context: EdgeExtractionContext,
): Edge[] => {
	const edges: Edge[] = [];

	edges.push(...extractContainsEdges(sourceFile, nodes, context));
	edges.push(...extractImportEdges(sourceFile, context));
	edges.push(...extractCallEdges(sourceFile, nodes, context));
	edges.push(...extractInheritanceEdges(sourceFile, context));
	edges.push(...extractTypeUsageEdges(sourceFile, nodes, context));

	return edges;
};
