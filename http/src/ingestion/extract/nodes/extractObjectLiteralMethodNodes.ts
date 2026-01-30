import { Node, type SourceFile } from "ts-morph";
import type { FunctionNode } from "../../../db/Types.js";
import { generateNodeId } from "../../generateNodeId.js";
import type { NodeExtractionContext } from "./NodeExtractionContext.js";
import { normalizeTypeText } from "./normalizeTypeText.js";

/**
 * Extract methods from object literals as Function nodes.
 *
 * @example
 * export const userService = {
 *   login(user: User): boolean { return true; }
 * };
 * // Extracted as FunctionNode with id "file.ts:userService.login"
 */
export const extractObjectLiteralMethodNodes = (
  sourceFile: SourceFile,
  context: NodeExtractionContext,
): FunctionNode[] => {
  const functions: FunctionNode[] = [];
  const variableStatements = sourceFile.getVariableStatements();

  for (const statement of variableStatements) {
    const isExported = statement.isExported();
    const declarations = statement.getDeclarations();

    for (const decl of declarations) {
      const initializer = decl.getInitializer();

      // Only process object literal expressions
      if (!initializer || !Node.isObjectLiteralExpression(initializer)) {
        continue;
      }

      const objectName = decl.getName();

      // Extract methods from the object literal
      for (const property of initializer.getProperties()) {
        // Method shorthand: { method() { } }
        if (Node.isMethodDeclaration(property)) {
          const methodName = property.getName();
          const parameters = property.getParameters().map((param) => ({
            name: param.getName(),
            type: normalizeTypeText(param.getTypeNode()?.getText()),
          }));
          const returnType = normalizeTypeText(
            property.getReturnTypeNode()?.getText(),
          );
          const isAsync = property.isAsync();

          functions.push({
            id: generateNodeId(context.filePath, objectName, methodName),
            type: "Function",
            name: methodName,
            package: context.package,
            filePath: context.filePath,
            startLine: property.getStartLineNumber(),
            endLine: property.getEndLineNumber(),
            exported: isExported,
            parameters,
            returnType,
            async: isAsync,
          });
        }

        // Arrow function property: { method: () => { } }
        if (Node.isPropertyAssignment(property)) {
          const propInitializer = property.getInitializer();
          if (
            propInitializer &&
            (Node.isArrowFunction(propInitializer) ||
              Node.isFunctionExpression(propInitializer))
          ) {
            const methodName = property.getName();
            const parameters = propInitializer.getParameters().map((param) => ({
              name: param.getName(),
              type: normalizeTypeText(param.getTypeNode()?.getText()),
            }));
            const returnType = normalizeTypeText(
              propInitializer.getReturnTypeNode()?.getText(),
            );
            const isAsync = propInitializer.isAsync();

            functions.push({
              id: generateNodeId(context.filePath, objectName, methodName),
              type: "Function",
              name: methodName,
              package: context.package,
              filePath: context.filePath,
              startLine: property.getStartLineNumber(),
              endLine: property.getEndLineNumber(),
              exported: isExported,
              parameters,
              returnType,
              async: isAsync,
            });
          }
        }
      }
    }
  }

  return functions;
};
