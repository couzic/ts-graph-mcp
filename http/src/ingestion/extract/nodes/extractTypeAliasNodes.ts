import type { SourceFile } from "ts-morph";
import type { Extracted, TypeAliasNode } from "../../../db/Types.js";
import { generateNodeId } from "../../generateNodeId.js";
import type { NodeExtractionContext } from "./NodeExtractionContext.js";
import { normalizeTypeText } from "./normalizeTypeText.js";

/**
 * Extract type alias nodes from a source file.
 */
export const extractTypeAliasNodes = (
  sourceFile: SourceFile,
  context: NodeExtractionContext,
): Extracted<TypeAliasNode>[] => {
  const typeAliases = sourceFile.getTypeAliases();
  return typeAliases.map((typeAlias) => {
    const name = typeAlias.getName();
    const startLine = typeAlias.getStartLineNumber();
    const endLine = typeAlias.getEndLineNumber();
    const exported = typeAlias.isExported();

    // Extract aliased type
    const typeNode = typeAlias.getTypeNode();
    const aliasedType = normalizeTypeText(typeNode?.getText());

    return {
      id: generateNodeId(context.filePath, "TypeAlias", name),
      type: "TypeAlias",
      name,
      package: context.package,
      filePath: context.filePath,
      startLine,
      endLine,
      exported,
      aliasedType,
    };
  });
};
