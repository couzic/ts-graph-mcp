import type { EdgeType } from "@ts-graph/shared";
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
  "Partial",
  "Required",
  "Readonly",
  "Pick",
  "Omit",
  "Record",
  "Exclude",
  "Extract",
  "NonNullable",
  "ReturnType",
  "Parameters",
  "InstanceType",
  "ConstructorParameters",
]);

/**
 * Extract DERIVES_FROM and ALIAS_FOR edges from type alias declarations.
 *
 * @example
 * type Person = User;           // Person --ALIAS_FOR--> User
 * type Customer = User & {...}; // Customer --DERIVES_FROM--> User
 * type Result = A | B;          // Result --DERIVES_FROM--> A, Result --DERIVES_FROM--> B
 */
export const extractTypeAliasEdges = (
  sourceFile: SourceFile,
  context: EdgeExtractionContext,
): Edge[] => {
  const edges: Edge[] = [];
  const typeMap = buildCombinedTypeMap(sourceFile, context);

  for (const typeAlias of sourceFile.getTypeAliases()) {
    const aliasName = typeAlias.getName();
    const sourceId = generateNodeId(context.filePath, "TypeAlias", aliasName);
    const typeNode = typeAlias.getTypeNode();

    if (!typeNode) {
      continue;
    }

    // Union type: A | B -> DERIVES_FROM for each member
    if (Node.isUnionTypeNode(typeNode)) {
      const typeNames = extractTypeNamesFromComposite(
        typeNode.getTypeNodes(),
        typeMap,
      );
      for (const typeName of typeNames) {
        const targetId = typeMap.get(typeName);
        if (targetId) {
          edges.push({
            source: sourceId,
            target: targetId,
            type: "DERIVES_FROM",
          });
        }
      }
      continue;
    }

    // Intersection type: A & B -> DERIVES_FROM for each member
    if (Node.isIntersectionTypeNode(typeNode)) {
      const typeNames = extractTypeNamesFromComposite(
        typeNode.getTypeNodes(),
        typeMap,
      );
      for (const typeName of typeNames) {
        const targetId = typeMap.get(typeName);
        if (targetId) {
          edges.push({
            source: sourceId,
            target: targetId,
            type: "DERIVES_FROM",
          });
        }
      }
      continue;
    }

    // Direct type reference: type Person = User -> ALIAS_FOR
    if (Node.isTypeReference(typeNode)) {
      const result = extractFromTypeReference(typeNode, typeMap);
      if (result) {
        edges.push({
          source: sourceId,
          target: result.targetId,
          type: result.edgeType,
        });
      }
      continue;
    }

    // Array type: type Users = User[] -> ALIAS_FOR
    if (Node.isArrayTypeNode(typeNode)) {
      const elementType = typeNode.getElementTypeNode();
      const typeNames = extractSimpleTypeNames(elementType, typeMap);
      for (const typeName of typeNames) {
        const targetId = typeMap.get(typeName);
        if (targetId) {
          edges.push({ source: sourceId, target: targetId, type: "ALIAS_FOR" });
        }
      }
    }
  }

  return edges;
};

/**
 * Extract type names from composite type nodes (union/intersection members).
 */
const extractTypeNamesFromComposite = (
  typeNodes: TypeNode[],
  typeMap: TypeMap,
): string[] => {
  const names: string[] = [];

  for (const node of typeNodes) {
    // Skip literal types (like inline object types { id: string })
    if (Node.isTypeLiteral(node)) {
      continue;
    }

    // Skip literal types like null, undefined
    if (Node.isLiteralTypeNode(node)) {
      continue;
    }

    // Handle type references
    if (Node.isTypeReference(node)) {
      const typeName = node.getTypeName();
      const name = Node.isIdentifier(typeName)
        ? typeName.getText()
        : typeName.getText();

      // Skip primitives
      if (PRIMITIVES.has(name.toLowerCase())) {
        continue;
      }

      // For built-in wrappers, extract inner types
      if (BUILT_IN_TYPES.has(name)) {
        const innerNames = extractInnerTypes(node, typeMap);
        names.push(...innerNames);
        continue;
      }

      if (typeMap.has(name)) {
        names.push(name);
      }
    }
  }

  return names;
};

/**
 * Extract from a type reference, handling built-in wrappers.
 */
const extractFromTypeReference = (
  typeNode: TypeNode,
  typeMap: TypeMap,
): { targetId: string; edgeType: EdgeType } | null => {
  if (!Node.isTypeReference(typeNode)) {
    return null;
  }

  const typeName = typeNode.getTypeName();
  const name = Node.isIdentifier(typeName)
    ? typeName.getText()
    : typeName.getText();

  // Skip primitives
  if (PRIMITIVES.has(name.toLowerCase())) {
    return null;
  }

  // For built-in wrappers (Array<User>, Promise<User>, Partial<User>),
  // extract the inner type
  if (BUILT_IN_TYPES.has(name)) {
    const innerNames = extractInnerTypes(typeNode, typeMap);
    if (innerNames.length > 0 && innerNames[0]) {
      const targetId = typeMap.get(innerNames[0]);
      if (targetId) {
        return { targetId, edgeType: "ALIAS_FOR" };
      }
    }
    return null;
  }

  // Direct type reference
  const targetId = typeMap.get(name);
  if (targetId) {
    return { targetId, edgeType: "ALIAS_FOR" };
  }

  return null;
};

/**
 * Extract inner type names from generic types.
 */
const extractInnerTypes = (typeNode: TypeNode, typeMap: TypeMap): string[] => {
  if (!Node.isTypeReference(typeNode)) {
    return [];
  }

  const names: string[] = [];
  const typeArgs = typeNode.getTypeArguments();

  for (const arg of typeArgs) {
    const argNames = extractSimpleTypeNames(arg, typeMap);
    names.push(...argNames);
  }

  return names;
};

/**
 * Extract simple type names (non-composite).
 */
const extractSimpleTypeNames = (
  typeNode: TypeNode,
  typeMap: TypeMap,
): string[] => {
  const names: string[] = [];

  if (Node.isTypeReference(typeNode)) {
    const typeName = typeNode.getTypeName();
    const name = Node.isIdentifier(typeName)
      ? typeName.getText()
      : typeName.getText();

    if (!PRIMITIVES.has(name.toLowerCase()) && !BUILT_IN_TYPES.has(name)) {
      if (typeMap.has(name)) {
        names.push(name);
      }
    } else if (BUILT_IN_TYPES.has(name)) {
      // Recurse into built-in wrappers
      const innerNames = extractInnerTypes(typeNode, typeMap);
      names.push(...innerNames);
    }
  }

  if (Node.isArrayTypeNode(typeNode)) {
    const innerNames = extractSimpleTypeNames(
      typeNode.getElementTypeNode(),
      typeMap,
    );
    names.push(...innerNames);
  }

  return names;
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
