import {
  type ArrowFunction,
  type FunctionDeclaration,
  type FunctionExpression,
  type MethodDeclaration,
  Node,
  type ObjectLiteralExpression,
  type SourceFile,
  type TypeNode,
} from "ts-morph";
import type { Edge } from "../../../db/Types.js";
import { generateNodeId } from "../../generateNodeId.js";
import { buildImportMap } from "./buildImportMap.js";
import type { EdgeExtractionContext } from "./EdgeExtractionContext.js";

/**
 * A map from type names to their node IDs.
 */
type TypeMap = Map<string, string>;

const PRIMITIVES = new Set([
  "string",
  "number",
  "boolean",
  "symbol",
  "bigint",
  "void",
  "never",
  "any",
  "unknown",
  "null",
  "undefined",
]);

const BUILT_IN_TYPES = new Set([
  "Array",
  "Map",
  "Set",
  "Promise",
  "Date",
  "RegExp",
  "Error",
  "Function",
  "Object",
  "String",
  "Number",
  "Boolean",
  "Symbol",
  "BigInt",
  "WeakMap",
  "WeakSet",
]);

/**
 * Extract TAKES and RETURNS edges from functions, methods, and object literal methods.
 *
 * @example
 * function login(user: User): Session { }
 * // login --TAKES--> User
 * // login --RETURNS--> Session
 */
export const extractTakesReturnsEdges = (
  sourceFile: SourceFile,
  context: EdgeExtractionContext,
): Edge[] => {
  const edges: Edge[] = [];
  const typeMap = buildCombinedTypeMap(sourceFile, context);

  // Regular functions
  for (const func of sourceFile.getFunctions()) {
    const funcName = func.getName();
    if (!funcName) {
      continue;
    }
    const sourceId = generateNodeId(context.filePath, "Function", funcName);
    extractFromCallable(func, sourceId, typeMap, edges);
  }

  // Arrow functions assigned to variables
  for (const variable of sourceFile.getVariableDeclarations()) {
    const varName = variable.getName();
    const initializer = variable.getInitializer();
    if (
      initializer &&
      (Node.isArrowFunction(initializer) ||
        Node.isFunctionExpression(initializer))
    ) {
      const sourceId = generateNodeId(context.filePath, "Function", varName);
      extractFromCallable(initializer, sourceId, typeMap, edges);

      // Factory function without explicit return type → RETURNS edge to SyntheticType
      if (!initializer.getReturnTypeNode() && isFactoryFunction(initializer)) {
        const syntheticName = `ReturnType<typeof ${varName}>`;
        const targetId = generateNodeId(
          context.filePath,
          "SyntheticType",
          syntheticName,
        );
        edges.push({ source: sourceId, target: targetId, type: "RETURNS" });
      }
    }
  }

  // Class methods
  for (const classDecl of sourceFile.getClasses()) {
    const className = classDecl.getName();
    if (!className) {
      continue;
    }
    for (const method of classDecl.getMethods()) {
      const methodName = method.getName();
      const sourceId = generateNodeId(
        context.filePath,
        "Method",
        `${className}.${methodName}`,
      );
      extractFromCallable(method, sourceId, typeMap, edges);
    }
  }

  // Object literal methods (plain objects and factory functions)
  for (const statement of sourceFile.getVariableStatements()) {
    for (const decl of statement.getDeclarations()) {
      const initializer = decl.getInitializer();
      if (!initializer) {
        continue;
      }

      let objectLiteral: ObjectLiteralExpression | undefined;
      let prefix: string;

      if (Node.isObjectLiteralExpression(initializer)) {
        objectLiteral = initializer;
        prefix = decl.getName();
      } else if (
        (Node.isArrowFunction(initializer) ||
          Node.isFunctionExpression(initializer)) &&
        isFactoryFunction(initializer)
      ) {
        objectLiteral = getFactoryObjectLiteral(initializer);
        prefix = `ReturnType<typeof ${decl.getName()}>`;
      } else {
        continue;
      }

      if (!objectLiteral) {
        continue;
      }

      for (const property of objectLiteral.getProperties()) {
        if (Node.isMethodDeclaration(property)) {
          const methodName = property.getName();
          const sourceId = generateNodeId(
            context.filePath,
            "Function",
            `${prefix}.${methodName}`,
          );
          extractFromCallable(property, sourceId, typeMap, edges);
        }
        if (Node.isPropertyAssignment(property)) {
          const propInit = property.getInitializer();
          if (
            propInit &&
            (Node.isArrowFunction(propInit) ||
              Node.isFunctionExpression(propInit))
          ) {
            const methodName = property.getName();
            const sourceId = generateNodeId(
              context.filePath,
              "Function",
              `${prefix}.${methodName}`,
            );
            extractFromCallable(propInit, sourceId, typeMap, edges);
          }
        }
      }
    }
  }

  return edges;
};

/**
 * Build combined type map from local definitions and imports.
 */
const buildCombinedTypeMap = (
  sourceFile: SourceFile,
  context: EdgeExtractionContext,
): TypeMap => {
  const map: TypeMap = new Map();

  // Local interfaces
  for (const iface of sourceFile.getInterfaces()) {
    const name = iface.getName();
    map.set(name, generateNodeId(context.filePath, "Interface", name));
  }

  // Local type aliases
  for (const typeAlias of sourceFile.getTypeAliases()) {
    const name = typeAlias.getName();
    map.set(name, generateNodeId(context.filePath, "TypeAlias", name));
  }

  // Local classes (can be used as types)
  for (const classDecl of sourceFile.getClasses()) {
    const name = classDecl.getName();
    if (name) {
      map.set(name, generateNodeId(context.filePath, "Class", name));
    }
  }

  // Imported types
  const importMap = buildImportMap(sourceFile, context.filePath, {
    includeTypeImports: true,
    projectRegistry: context.projectRegistry,
  });
  for (const [name, targetId] of importMap) {
    map.set(name, targetId);
  }

  return map;
};

/**
 * Extract TAKES/RETURNS edges from a callable.
 */
const extractFromCallable = (
  callable:
    | FunctionDeclaration
    | ArrowFunction
    | FunctionExpression
    | MethodDeclaration,
  sourceId: string,
  typeMap: TypeMap,
  edges: Edge[],
): void => {
  // Parameter types -> TAKES edges
  for (const param of callable.getParameters()) {
    const typeNode = param.getTypeNode();
    if (typeNode) {
      const typeNames = extractTypeNames(typeNode);
      for (const typeName of typeNames) {
        const targetId = typeMap.get(typeName);
        if (targetId) {
          edges.push({ source: sourceId, target: targetId, type: "TAKES" });
        }
      }
    }
  }

  // Return type -> RETURNS edge
  const returnTypeNode = callable.getReturnTypeNode();
  if (returnTypeNode) {
    const typeNames = extractTypeNames(returnTypeNode);
    for (const typeName of typeNames) {
      const targetId = typeMap.get(typeName);
      if (targetId) {
        edges.push({ source: sourceId, target: targetId, type: "RETURNS" });
      }
    }
  }
};

/**
 * Extract type names from a type node, handling generics and unions.
 */
const extractTypeNames = (typeNode: TypeNode): string[] => {
  const names: string[] = [];
  extractTypeNamesRecursive(typeNode, names);
  return names;
};

const extractTypeNamesRecursive = (
  typeNode: TypeNode,
  names: string[],
): void => {
  // Union type: A | B
  if (Node.isUnionTypeNode(typeNode)) {
    for (const member of typeNode.getTypeNodes()) {
      extractTypeNamesRecursive(member, names);
    }
    return;
  }

  // Intersection type: A & B
  if (Node.isIntersectionTypeNode(typeNode)) {
    for (const member of typeNode.getTypeNodes()) {
      extractTypeNamesRecursive(member, names);
    }
    return;
  }

  // Array type: User[]
  if (Node.isArrayTypeNode(typeNode)) {
    extractTypeNamesRecursive(typeNode.getElementTypeNode(), names);
    return;
  }

  // Generic type: Promise<User>, Array<User>
  if (Node.isTypeReference(typeNode)) {
    const typeName = typeNode.getTypeName();
    const name = Node.isIdentifier(typeName)
      ? typeName.getText()
      : typeName.getText();

    // If it's a built-in wrapper, extract inner types
    if (BUILT_IN_TYPES.has(name)) {
      const typeArgs = typeNode.getTypeArguments();
      for (const arg of typeArgs) {
        extractTypeNamesRecursive(arg, names);
      }
      return;
    }

    // Skip primitives
    if (PRIMITIVES.has(name.toLowerCase())) {
      return;
    }

    names.push(name);
    return;
  }

  // Literal types (null, undefined) - skip
  if (Node.isLiteralTypeNode(typeNode)) {
    return;
  }

  // Primitive keyword types (string, number, etc.) - skip
  // These are handled by the TypeReference case above or by keyword nodes
};

/**
 * Detect factory functions: arrow/function expressions that return object literals.
 *
 * Matches two patterns:
 * - Arrow with expression body: `() => ({ ... })`
 * - Arrow/function with block body containing `return { ... }`
 */
const isFactoryFunction = (
  node: ArrowFunction | FunctionExpression,
): boolean => {
  const body = node.getBody();

  // Arrow with expression body: () => ({ ... })
  if (Node.isParenthesizedExpression(body)) {
    return Node.isObjectLiteralExpression(body.getExpression());
  }
  if (Node.isObjectLiteralExpression(body)) {
    return true;
  }

  // Block body: look for `return { ... }` as the last statement
  if (Node.isBlock(body)) {
    const statements = body.getStatements();
    const lastStatement = statements[statements.length - 1];
    if (lastStatement && Node.isReturnStatement(lastStatement)) {
      const returnExpr = lastStatement.getExpression();
      return (
        returnExpr !== undefined && Node.isObjectLiteralExpression(returnExpr)
      );
    }
  }

  return false;
};

/**
 * Extract the returned object literal from a factory function.
 * Only call after `isFactoryFunction` returns true.
 */
const getFactoryObjectLiteral = (
  node: ArrowFunction | FunctionExpression,
): ObjectLiteralExpression | undefined => {
  const body = node.getBody();

  if (Node.isParenthesizedExpression(body)) {
    const expr = body.getExpression();
    if (Node.isObjectLiteralExpression(expr)) {
      return expr;
    }
  }
  if (Node.isObjectLiteralExpression(body)) {
    return body;
  }

  if (Node.isBlock(body)) {
    const statements = body.getStatements();
    const lastStatement = statements[statements.length - 1];
    if (lastStatement && Node.isReturnStatement(lastStatement)) {
      const returnExpr = lastStatement.getExpression();
      if (returnExpr && Node.isObjectLiteralExpression(returnExpr)) {
        return returnExpr;
      }
    }
  }

  return undefined;
};
