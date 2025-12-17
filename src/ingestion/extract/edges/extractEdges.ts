import type { SourceFile } from "ts-morph";
import type { Edge } from "../../../db/Types.js";
import type { EdgeExtractionContext } from "./EdgeExtractionContext.js";
import { extractCallEdges } from "./extractCallEdges.js";
import { extractContainsEdges } from "./extractContainsEdges.js";
import { extractImportEdges } from "./extractImportEdges.js";
import { extractInheritanceEdges } from "./extractInheritanceEdges.js";
import { extractTypeUsageEdges } from "./extractTypeUsageEdges.js";

export type { EdgeExtractionContext };

/**
 * Extract all edges from a source file.
 *
 * All edge extractors now work directly from the AST using import maps
 * for cross-file resolution. No global nodes array needed.
 */
export const extractEdges = (
	sourceFile: SourceFile,
	context: EdgeExtractionContext,
): Edge[] => {
	const edges: Edge[] = [];

	edges.push(...extractContainsEdges(sourceFile, context));
	edges.push(...extractImportEdges(sourceFile, context));
	edges.push(...extractCallEdges(sourceFile, context));
	edges.push(...extractInheritanceEdges(sourceFile, context));
	edges.push(...extractTypeUsageEdges(sourceFile, context));

	return edges;
};
