import { Node, type ObjectLiteralExpression, type SourceFile } from "ts-morph";
import type {
  Extracted,
  FunctionNode,
  SyntheticTypeNode,
} from "../../../db/Types.js";
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
): Extracted<FunctionNode | SyntheticTypeNode>[] => {
  const nodes: Extracted<FunctionNode | SyntheticTypeNode>[] = [];
  const variableStatements = sourceFile.getVariableStatements();

  for (const statement of variableStatements) {
    const isExported = statement.isExported();
    const declarations = statement.getDeclarations();

    for (const decl of declarations) {
      const initializer = decl.getInitializer();
      if (!initializer) {
        continue;
      }

      let objectLiteral: ObjectLiteralExpression | undefined;
      let parentName = "";

      if (Node.isObjectLiteralExpression(initializer)) {
        objectLiteral = initializer;
        parentName = decl.getName();
      } else if (
        Node.isArrowFunction(initializer) ||
        Node.isFunctionExpression(initializer)
      ) {
        const body = initializer.getBody();
        const unwrapped = Node.isParenthesizedExpression(body)
          ? body.getExpression()
          : body;
        if (Node.isObjectLiteralExpression(unwrapped)) {
          objectLiteral = unwrapped;
          parentName = `ReturnType<typeof ${decl.getName()}>`;
          nodes.push({
            id: generateNodeId(context.filePath, "SyntheticType", parentName),
            type: "SyntheticType",
            name: parentName,
            package: context.package,
            filePath: context.filePath,
            startLine: unwrapped.getStartLineNumber(),
            endLine: unwrapped.getEndLineNumber(),
            exported: isExported,
          });
        }
      }

      if (!objectLiteral) {
        continue;
      }

      for (const property of objectLiteral.getProperties()) {
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

          const methodNode: Extracted<FunctionNode> = {
            id: generateNodeId(
              context.filePath,
              "Function",
              `${parentName}.${methodName}`,
            ),
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
          };
          nodes.push(methodNode);
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

            const methodNode: Extracted<FunctionNode> = {
              id: generateNodeId(
                context.filePath,
                "Function",
                `${parentName}.${methodName}`,
              ),
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
            };
            nodes.push(methodNode);
          }
        }
      }
    }
  }

  return nodes;
};
