import { Node, type SourceFile, type TypeNode } from "ts-morph";
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
 * Extract HAS_TYPE edges from variable declarations.
 *
 * @example
 * const currentUser: User = { name: "Alice" };
 * // currentUser --HAS_TYPE--> User
 */
export const extractHasTypeEdges = (
  sourceFile: SourceFile,
  context: EdgeExtractionContext,
): Edge[] => {
  const edges: Edge[] = [];
  const typeMap = buildCombinedTypeMap(sourceFile, context);

  for (const variable of sourceFile.getVariableDeclarations()) {
    const varName = variable.getName();
    const typeNode = variable.getTypeNode();

    // Skip variables without type annotation
    if (!typeNode) {
      continue;
    }

    // Skip arrow functions and function expressions (handled by TAKES/RETURNS)
    const initializer = variable.getInitializer();
    if (
      initializer &&
      (Node.isArrowFunction(initializer) ||
        Node.isFunctionExpression(initializer))
    ) {
      continue;
    }

    const sourceId = generateNodeId(context.filePath, "Variable", varName);
    const typeNames = extractTypeNames(typeNode);

    for (const typeName of typeNames) {
      const targetId = typeMap.get(typeName);
      if (targetId) {
        edges.push({ source: sourceId, target: targetId, type: "HAS_TYPE" });
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

  // Local classes
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
};
