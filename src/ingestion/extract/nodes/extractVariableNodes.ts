import { type SourceFile, VariableDeclarationKind } from "ts-morph";
import type { VariableNode } from "../../../db/Types.js";
import { generateNodeId } from "../../generateNodeId.js";
import type { NodeExtractionContext } from "./NodeExtractionContext.js";
import { normalizeTypeText } from "./normalizeTypeText.js";

/**
 * Extract variable nodes from a source file.
 */
export const extractVariableNodes = (
  sourceFile: SourceFile,
  context: NodeExtractionContext,
): VariableNode[] => {
  const variableStatements = sourceFile.getVariableStatements();
  const variables: VariableNode[] = [];

  for (const statement of variableStatements) {
    const declarations = statement.getDeclarations();
    const declarationKind = statement.getDeclarationKind();
    // Compare against VariableDeclarationKind.Const enum value
    const isConst = declarationKind === VariableDeclarationKind.Const;

    for (const decl of declarations) {
      const name = decl.getName();
      const startLine = decl.getStartLineNumber();
      const endLine = decl.getEndLineNumber();
      const exported = statement.isExported();

      // Extract type annotation
      const typeNode = decl.getTypeNode();
      const variableType = normalizeTypeText(typeNode?.getText());

      variables.push({
        id: generateNodeId(context.filePath, name),
        type: "Variable",
        name,
        package: context.package,
        filePath: context.filePath,
        startLine,
        endLine,
        exported,
        variableType,
        isConst,
      });
    }
  }

  return variables;
};
