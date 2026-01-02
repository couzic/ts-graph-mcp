import {
  type ArrowFunction,
  type FunctionDeclaration,
  type Identifier,
  type MethodDeclaration,
  type SourceFile,
  SyntaxKind,
  Node as TsMorphNode,
} from "ts-morph";
import type { Edge } from "../../../db/Types.js";
import { generateNodeId } from "../../generateNodeId.js";
import { buildImportMap } from "./buildImportMap.js";
import type { EdgeExtractionContext } from "./EdgeExtractionContext.js";

/**
 * A map from symbol names to their node IDs.
 */
type SymbolMap = Map<string, string>;

type ReferenceContext =
  | "callback"
  | "property"
  | "array"
  | "return"
  | "assignment"
  | "access";

/**
 * Extract REFERENCES edges.
 *
 * REFERENCES captures when a function/variable is passed or stored rather than directly invoked:
 * - Callback arguments: array.map(fn)
 * - Object properties: { handler: fn }
 * - Array elements: [fn1, fn2]
 * - Return values: return fn
 * - Variable assignments: const x = fn
 * - Variable access: userFormatters[type] (inside function body)
 */
export const extractReferenceEdges = (
  sourceFile: SourceFile,
  context: EdgeExtractionContext,
): Edge[] => {
  const edges: Edge[] = [];
  const symbolMap = buildCombinedSymbolMap(sourceFile, context);

  // Process top-level variable declarations (for object/array literals storing functions)
  extractFromVariableDeclarations(sourceFile, context, symbolMap, edges);

  // Process functions, arrow functions, and methods (for callbacks, returns, accesses)
  extractFromCallables(sourceFile, context, symbolMap, edges);

  return edges;
};

/**
 * Build a combined symbol map from local definitions and imports.
 */
const buildCombinedSymbolMap = (
  sourceFile: SourceFile,
  context: EdgeExtractionContext,
): SymbolMap => {
  const map: SymbolMap = new Map();

  // Add local symbols
  addLocalSymbols(map, sourceFile, context.filePath);

  // Add imported symbols
  const importMap = buildImportMap(sourceFile, context.filePath, {
    projectRegistry: context.projectRegistry,
  });
  for (const [name, targetId] of importMap) {
    map.set(name, targetId);
  }

  return map;
};

/**
 * Add symbols defined in the current file to the map.
 */
const addLocalSymbols = (
  map: SymbolMap,
  sourceFile: SourceFile,
  filePath: string,
): void => {
  // Functions
  for (const func of sourceFile.getFunctions()) {
    const name = func.getName();
    if (name) {
      map.set(name, `${filePath}:${name}`);
    }
  }

  // Variables (including arrow functions)
  for (const variable of sourceFile.getVariableDeclarations()) {
    const name = variable.getName();
    map.set(name, `${filePath}:${name}`);
  }

  // Classes and their methods
  for (const classDecl of sourceFile.getClasses()) {
    const className = classDecl.getName();
    if (className) {
      map.set(className, `${filePath}:${className}`);
      for (const method of classDecl.getMethods()) {
        const methodName = method.getName();
        map.set(methodName, `${filePath}:${className}.${methodName}`);
      }
    }
  }

  // Interfaces
  for (const iface of sourceFile.getInterfaces()) {
    const name = iface.getName();
    map.set(name, `${filePath}:${name}`);
  }

  // Type aliases
  for (const typeAlias of sourceFile.getTypeAliases()) {
    const name = typeAlias.getName();
    map.set(name, `${filePath}:${name}`);
  }
};

/**
 * Extract references from top-level variable declarations.
 * Handles: object properties, array elements, variable assignments.
 */
const extractFromVariableDeclarations = (
  sourceFile: SourceFile,
  context: EdgeExtractionContext,
  symbolMap: SymbolMap,
  edges: Edge[],
): void => {
  for (const variable of sourceFile.getVariableDeclarations()) {
    const varName = variable.getName();
    const sourceId = generateNodeId(context.filePath, varName);
    const initializer = variable.getInitializer();

    if (!initializer) continue;

    // Skip arrow functions - they're definitions, not references
    if (TsMorphNode.isArrowFunction(initializer)) continue;

    // Variable assignment: const x = fn
    if (TsMorphNode.isIdentifier(initializer)) {
      const targetName = initializer.getText();
      const targetId = symbolMap.get(targetName);
      if (targetId && targetId !== sourceId) {
        edges.push({
          source: sourceId,
          target: targetId,
          type: "REFERENCES",
          referenceContext: "assignment",
        });
      }
      continue;
    }

    // Object literal: { handler: fn }
    if (TsMorphNode.isObjectLiteralExpression(initializer)) {
      for (const prop of initializer.getProperties()) {
        // PropertyAssignment: { handler: fn }
        if (TsMorphNode.isPropertyAssignment(prop)) {
          const propInit = prop.getInitializer();
          if (propInit && TsMorphNode.isIdentifier(propInit)) {
            const targetName = propInit.getText();
            const targetId = symbolMap.get(targetName);
            if (targetId && targetId !== sourceId) {
              edges.push({
                source: sourceId,
                target: targetId,
                type: "REFERENCES",
                referenceContext: "property",
              });
            }
          }
        }
        // ShorthandPropertyAssignment: { handler } (same as { handler: handler })
        if (TsMorphNode.isShorthandPropertyAssignment(prop)) {
          const targetName = prop.getName();
          const targetId = symbolMap.get(targetName);
          if (targetId && targetId !== sourceId) {
            edges.push({
              source: sourceId,
              target: targetId,
              type: "REFERENCES",
              referenceContext: "property",
            });
          }
        }
      }
      continue;
    }

    // Array literal: [fn1, fn2]
    if (TsMorphNode.isArrayLiteralExpression(initializer)) {
      for (const element of initializer.getElements()) {
        if (TsMorphNode.isIdentifier(element)) {
          const targetName = element.getText();
          const targetId = symbolMap.get(targetName);
          if (targetId && targetId !== sourceId) {
            edges.push({
              source: sourceId,
              target: targetId,
              type: "REFERENCES",
              referenceContext: "array",
            });
          }
        }
      }
    }
  }
};

/**
 * Extract references from callable bodies.
 * Handles: callback arguments, return values, variable accesses.
 */
const extractFromCallables = (
  sourceFile: SourceFile,
  context: EdgeExtractionContext,
  symbolMap: SymbolMap,
  edges: Edge[],
): void => {
  // Process functions
  for (const func of sourceFile.getFunctions()) {
    const funcName = func.getName();
    if (!funcName) continue;
    const callerId = generateNodeId(context.filePath, funcName);
    extractReferencesFromCallable(func, callerId, symbolMap, edges);
  }

  // Process arrow functions assigned to variables
  for (const variable of sourceFile.getVariableDeclarations()) {
    const varName = variable.getName();
    const initializer = variable.getInitializer();
    if (initializer && TsMorphNode.isArrowFunction(initializer)) {
      const callerId = generateNodeId(context.filePath, varName);
      extractReferencesFromCallable(initializer, callerId, symbolMap, edges);
    }
  }

  // Process class methods
  for (const classDecl of sourceFile.getClasses()) {
    const className = classDecl.getName();
    if (!className) continue;
    for (const method of classDecl.getMethods()) {
      const methodName = method.getName();
      const callerId = generateNodeId(context.filePath, className, methodName);
      extractReferencesFromCallable(method, callerId, symbolMap, edges);
    }
  }
};

/**
 * Extract references from a single callable's body.
 */
const extractReferencesFromCallable = (
  callable: FunctionDeclaration | ArrowFunction | MethodDeclaration,
  callerId: string,
  symbolMap: SymbolMap,
  edges: Edge[],
): void => {
  const body = callable.getBody();
  if (!body) return;

  // Track targets we've already added edges for (avoid duplicates)
  const addedTargets = new Map<string, ReferenceContext>();

  // Get all identifiers in the body
  const identifiers = body.getDescendantsOfKind(SyntaxKind.Identifier);

  for (const identifier of identifiers) {
    const name = identifier.getText();
    const targetId = symbolMap.get(name);
    if (!targetId || targetId === callerId) continue;

    // Skip if it's in callee position of a CallExpression (those are CALLS, not REFERENCES)
    if (isCalleePosition(identifier)) continue;

    // Skip if it's a definition site
    if (isDefinitionSite(identifier)) continue;

    // Skip if it's a property access name (obj.prop - skip "prop")
    if (isPropertyAccessName(identifier)) continue;

    // Determine the reference context
    const refContext = determineReferenceContext(identifier);
    if (!refContext) continue;

    // Only add if we haven't added this target with this context yet
    const key = `${targetId}:${refContext}`;
    if (!addedTargets.has(key)) {
      addedTargets.set(key, refContext);
      edges.push({
        source: callerId,
        target: targetId,
        type: "REFERENCES",
        referenceContext: refContext,
      });
    }
  }
};

/**
 * Check if an identifier is in the callee position of a CallExpression.
 * e.g., in `fn()`, `fn` is the callee.
 */
const isCalleePosition = (identifier: Identifier): boolean => {
  const parent = identifier.getParent();

  // Direct call: fn()
  if (TsMorphNode.isCallExpression(parent)) {
    return parent.getExpression() === identifier;
  }

  return false;
};

/**
 * Check if an identifier is a definition site (not a reference).
 */
const isDefinitionSite = (identifier: Identifier): boolean => {
  const parent = identifier.getParent();

  // Variable declaration: const x = ...
  if (TsMorphNode.isVariableDeclaration(parent)) {
    return parent.getNameNode() === identifier;
  }

  // Parameter: (x) => ...
  if (TsMorphNode.isParameterDeclaration(parent)) {
    return parent.getNameNode() === identifier;
  }

  // Function name: function foo() {}
  if (TsMorphNode.isFunctionDeclaration(parent)) {
    return parent.getNameNode() === identifier;
  }

  return false;
};

/**
 * Check if an identifier is a property access name.
 * e.g., in `obj.prop`, `prop` is the property access name.
 */
const isPropertyAccessName = (identifier: Identifier): boolean => {
  const parent = identifier.getParent();
  if (TsMorphNode.isPropertyAccessExpression(parent)) {
    return parent.getNameNode() === identifier;
  }
  return false;
};

/**
 * Determine the reference context for an identifier.
 * Returns null if it's not a reference we should capture.
 */
const determineReferenceContext = (
  identifier: Identifier,
): ReferenceContext | null => {
  const parent = identifier.getParent();

  // Callback argument: fn(callback) - identifier is an argument in a call
  if (TsMorphNode.isCallExpression(parent)) {
    const args = parent.getArguments();
    if (args.some((arg) => arg === identifier)) {
      return "callback";
    }
  }

  // Return value: return fn
  if (TsMorphNode.isReturnStatement(parent)) {
    return "return";
  }

  // Element access on a variable: userFormatters[type]
  // The identifier being accessed (not the index) is a reference
  if (TsMorphNode.isElementAccessExpression(parent)) {
    if (parent.getExpression() === identifier) {
      return "access";
    }
  }

  // Property access base: obj.method - obj is being accessed
  if (TsMorphNode.isPropertyAccessExpression(parent)) {
    if (parent.getExpression() === identifier) {
      return "access";
    }
  }

  return null;
};
