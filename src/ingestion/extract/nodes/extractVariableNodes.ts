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

  // Get default export to check if any variable is default-exported
  // e.g., `const Foo = ...; export default Foo;`
  const defaultExport = sourceFile.getExportAssignment(
    (a) => !a.isExportEquals(),
  );
  const defaultExportedName = defaultExport?.getExpression().getText();

  for (const statement of variableStatements) {
    const declarations = statement.getDeclarations();
    const declarationKind = statement.getDeclarationKind();
    // Compare against VariableDeclarationKind.Const enum value
    const isConst = declarationKind === VariableDeclarationKind.Const;

    for (const decl of declarations) {
      const name = decl.getName();
      const startLine = decl.getStartLineNumber();
      const endLine = decl.getEndLineNumber();
      const isDirectlyExported = statement.isExported();
      const isDefaultExported = name === defaultExportedName;
      const exported = isDirectlyExported || isDefaultExported;

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
