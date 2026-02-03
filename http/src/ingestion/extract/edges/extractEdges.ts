import type { SourceFile } from "ts-morph";
import type { Edge } from "../../../db/Types.js";
import type { EdgeExtractionContext } from "./EdgeExtractionContext.js";
import { extractCallEdges } from "./extractCallEdges.js";
import { extractHasPropertyEdges } from "./extractHasPropertyEdges.js";
import { extractHasTypeEdges } from "./extractHasTypeEdges.js";
import { extractInheritanceEdges } from "./extractInheritanceEdges.js";
import { extractReferenceEdges } from "./extractReferenceEdges.js";
import { extractTakesReturnsEdges } from "./extractTakesReturnsEdges.js";
import { extractTypeAliasEdges } from "./extractTypeAliasEdges.js";

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

  edges.push(...extractCallEdges(sourceFile, context));
  edges.push(...extractInheritanceEdges(sourceFile, context));
  edges.push(...extractReferenceEdges(sourceFile, context));

  // Type signature edges (new)
  edges.push(...extractTakesReturnsEdges(sourceFile, context));
  edges.push(...extractHasTypeEdges(sourceFile, context));
  edges.push(...extractHasPropertyEdges(sourceFile, context));
  edges.push(...extractTypeAliasEdges(sourceFile, context));

  return edges;
};
