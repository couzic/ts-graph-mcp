import type { SourceFile } from "ts-morph";
import type { FileNode } from "../../../db/Types.js";
import { generateNodeId } from "../../generateNodeId.js";
import type { NodeExtractionContext } from "./NodeExtractionContext.js";

/**
 * Extract file node from a source file.
 */
export const extractFileNode = (
  sourceFile: SourceFile,
  context: NodeExtractionContext,
): FileNode => {
  const fileName = sourceFile.getBaseName();
  const extension = sourceFile.getExtension();
  const startLine = 1;
  const endLine = sourceFile.getEndLineNumber();

  return {
    id: generateNodeId(context.filePath),
    type: "File",
    name: fileName,
    package: context.package,
    filePath: context.filePath,
    startLine,
    endLine,
    exported: false,
    extension,
  };
};
