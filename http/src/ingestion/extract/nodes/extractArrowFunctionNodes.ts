import { Node, type SourceFile } from "ts-morph";
import type { FunctionNode } from "../../../db/Types.js";
import { generateNodeId } from "../../generateNodeId.js";
import type { NodeExtractionContext } from "./NodeExtractionContext.js";
import { normalizeTypeText } from "./normalizeTypeText.js";

/**
 * Extract arrow functions and function expressions as Function nodes.
 *
 * @example
 * const handler = (req: Request) => res.send("OK");
 * // Extracted as FunctionNode with name "handler"
 */
export const extractArrowFunctionNodes = (
  sourceFile: SourceFile,
  context: NodeExtractionContext,
): FunctionNode[] => {
  const variableStatements = sourceFile.getVariableStatements();
  const functions: FunctionNode[] = [];

  // Get default export to check if any variable is default-exported
  const defaultExport = sourceFile.getExportAssignment(
    (a) => !a.isExportEquals(),
  );
  const defaultExportedName = defaultExport?.getExpression().getText();

  for (const statement of variableStatements) {
    const declarations = statement.getDeclarations();

    for (const decl of declarations) {
      const initializer = decl.getInitializer();

      // Skip non-callable initializers
      if (
        !initializer ||
        (!Node.isArrowFunction(initializer) &&
          !Node.isFunctionExpression(initializer))
      ) {
        continue;
      }

      const name = decl.getName();
      const startLine = decl.getStartLineNumber();
      const endLine = decl.getEndLineNumber();
      const isDirectlyExported = statement.isExported();
      const isDefaultExported = name === defaultExportedName;
      const exported = isDirectlyExported || isDefaultExported;

      // Extract parameters from the arrow function / function expression
      const parameters = initializer.getParameters().map((param) => ({
        name: param.getName(),
        type: normalizeTypeText(param.getTypeNode()?.getText()),
      }));

      // Extract return type
      const returnTypeNode = initializer.getReturnTypeNode();
      const returnType = normalizeTypeText(returnTypeNode?.getText());

      // Check if async
      const isAsync = initializer.isAsync();

      functions.push({
        id: generateNodeId(context.filePath, "Function", name),
        type: "Function",
        name,
        package: context.package,
        filePath: context.filePath,
        startLine,
        endLine,
        exported,
        parameters,
        returnType,
        async: isAsync,
      });
    }
  }

  return functions;
};
