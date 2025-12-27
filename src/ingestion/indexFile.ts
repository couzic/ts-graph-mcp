import type { SourceFile } from "ts-morph";
import type { DbWriter } from "../db/DbWriter.js";
import { extractEdges } from "./extract/edges/extractEdges.js";
import { extractNodes } from "./extract/nodes/extractNodes.js";
import type { NodeExtractionContext } from "./extract/nodes/NodeExtractionContext.js";

/**
 * Result of indexing a single file.
 */
export interface IndexFileResult {
  /** Number of nodes extracted and written */
  nodesAdded: number;
  /** Number of edges extracted and written */
  edgesAdded: number;
}

/**
 * Index a single source file: extract nodes and edges, write to database.
 *
 * This is the core indexing primitive used by:
 * - indexProject (initial indexing)
 * - watchProject (incremental updates)
 * - syncOnStartup (offline change detection)
 *
 * Note: This function does NOT remove old data. Callers should call
 * writer.removeFileNodes() before calling this if reindexing.
 *
 * @param sourceFile - ts-morph SourceFile (already loaded into a Project)
 * @param context - Extraction context (filePath, module, package)
 * @param writer - Database writer instance
 * @returns Count of nodes and edges added
 */
export const indexFile = async (
  sourceFile: SourceFile,
  context: NodeExtractionContext,
  writer: DbWriter,
): Promise<IndexFileResult> => {
  let nodesAdded = 0;
  let edgesAdded = 0;

  // Extract and write nodes
  const nodes = extractNodes(sourceFile, context);
  if (nodes.length > 0) {
    await writer.addNodes(nodes);
    nodesAdded = nodes.length;
  }

  // Extract and write edges
  const edges = extractEdges(sourceFile, context);
  if (edges.length > 0) {
    await writer.addEdges(edges);
    edgesAdded = edges.length;
  }

  return { nodesAdded, edgesAdded };
};
