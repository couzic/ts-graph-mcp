import {
  type ArrowFunction,
  type CallExpression,
  type FunctionDeclaration,
  type MethodDeclaration,
  type SourceFile,
  SyntaxKind,
  Node as TsMorphNode,
} from "ts-morph";
import type { CallSiteRange, Edge } from "../../../db/Types.js";
import { generateNodeId } from "../../generateNodeId.js";
import { buildImportMap } from "./buildImportMap.js";
import type { EdgeExtractionContext } from "./EdgeExtractionContext.js";

/**
 * A map from symbol names to their node IDs.
 * Combines local symbols and imported symbols.
 */
type SymbolMap = Map<string, string>;

/**
 * Extract CALLS edges between functions and methods.
 *
 * Uses a simplified approach that doesn't require a global nodes array:
 * - Local symbols: Extracted from the current file's AST
 * - Imported symbols: Resolved via ts-morph + import map
 */
export const extractCallEdges = (
  sourceFile: SourceFile,
  context: EdgeExtractionContext,
): Edge[] => {
  const edges: Edge[] = [];

  // Build combined symbol map from local definitions + imports
  const symbolMap = buildCombinedSymbolMap(sourceFile, context.filePath);

  // Find all functions and methods
  const functions = sourceFile.getFunctions();
  const variables = sourceFile.getVariableDeclarations();
  const classes = sourceFile.getClasses();

  // Extract calls from functions
  for (const func of functions) {
    const funcName = func.getName();
    if (!funcName) continue;

    const callerId = generateNodeId(context.filePath, funcName);
    extractCallsFromCallable(func, callerId, symbolMap, edges);
  }

  // Extract calls from arrow functions assigned to variables
  for (const variable of variables) {
    const varName = variable.getName();
    const initializer = variable.getInitializer();

    if (initializer && TsMorphNode.isArrowFunction(initializer)) {
      const callerId = generateNodeId(context.filePath, varName);
      extractCallsFromCallable(initializer, callerId, symbolMap, edges);
    }
  }

  // Extract calls from methods
  for (const classDecl of classes) {
    const className = classDecl.getName();
    if (!className) continue;

    const methods = classDecl.getMethods();
    for (const method of methods) {
      const methodName = method.getName();
      const callerId = generateNodeId(context.filePath, className, methodName);
      extractCallsFromCallable(method, callerId, symbolMap, edges);
    }
  }

  return edges;
};

/**
 * Build a combined symbol map from local definitions and imports.
 * This is the simplified approach that doesn't need the global nodes array.
 */
const buildCombinedSymbolMap = (
  sourceFile: SourceFile,
  filePath: string,
): SymbolMap => {
  const map: SymbolMap = new Map();

  // 1. Add local symbols (defined in this file)
  addLocalSymbols(map, sourceFile, filePath);

  // 2. Add imported symbols (from import declarations)
  const importMap = buildImportMap(sourceFile, filePath);
  for (const [name, targetId] of importMap) {
    map.set(name, targetId);
  }

  return map;
};

/**
 * Add symbols defined in the current file to the map.
 * Constructs IDs directly as filePath:symbolName.
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

  // Arrow functions and other variables
  for (const variable of sourceFile.getVariableDeclarations()) {
    const name = variable.getName();
    map.set(name, `${filePath}:${name}`);
  }

  // Classes and their methods
  for (const classDecl of sourceFile.getClasses()) {
    const className = classDecl.getName();
    if (className) {
      map.set(className, `${filePath}:${className}`);

      // Add methods
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
 * Build a map of local variable aliases within a callable body.
 * Maps variable names to their original symbol names when assigned from known symbols.
 * E.g., `const fn = target` creates alias: fn -> target
 */
const buildLocalAliasMap = (
  callable: FunctionDeclaration | ArrowFunction | MethodDeclaration,
  symbolMap: SymbolMap,
): Map<string, string> => {
  const aliasMap = new Map<string, string>();

  const body = callable.getBody();
  if (!body) return aliasMap;

  // Find all variable declarations in the body
  const variableDeclarations = body.getDescendantsOfKind(
    SyntaxKind.VariableDeclaration,
  );

  for (const varDecl of variableDeclarations) {
    const varName = varDecl.getName();
    const initializer = varDecl.getInitializer();

    if (!initializer) continue;

    // Check if initializer is an identifier that's in our symbol map
    if (TsMorphNode.isIdentifier(initializer)) {
      const initializerName = initializer.getText();
      if (symbolMap.has(initializerName)) {
        aliasMap.set(varName, initializerName);
      }
    }
  }

  return aliasMap;
};

/**
 * Extract call expressions from a callable (function, arrow function, or method).
 */
const extractCallsFromCallable = (
  callable: FunctionDeclaration | ArrowFunction | MethodDeclaration,
  callerId: string,
  symbolMap: SymbolMap,
  edges: Edge[],
): void => {
  // For arrow functions, we need to get either the body block or the expression
  const nodesToSearch: TsMorphNode[] = [];

  if (TsMorphNode.isArrowFunction(callable)) {
    const body = callable.getBody();
    if (body) {
      nodesToSearch.push(body);
    }
  } else {
    const body = callable.getBody();
    if (body) {
      nodesToSearch.push(body);
    }
  }

  if (nodesToSearch.length === 0) return;

  // Build alias map for local variables that reference known symbols
  const aliasMap = buildLocalAliasMap(callable, symbolMap);

  // Collect call site ranges for each target
  const callSitesByTarget = new Map<string, CallSiteRange[]>();

  for (const nodeToSearch of nodesToSearch) {
    // Get all call expressions (including the node itself if it's a call expression)
    const callExpressions: CallExpression[] = [];

    if (TsMorphNode.isCallExpression(nodeToSearch)) {
      callExpressions.push(nodeToSearch);
    }

    callExpressions.push(
      ...nodeToSearch.getDescendantsOfKind(SyntaxKind.CallExpression),
    );

    for (const callExpr of callExpressions) {
      const expression = callExpr.getExpression();
      const calleeName = expression.getText().split(".")[0]; // Handle foo.bar() -> foo

      if (!calleeName) continue;

      // Resolve alias if this is a local variable pointing to a known symbol
      const resolvedName = aliasMap.get(calleeName) ?? calleeName;

      if (symbolMap.has(resolvedName)) {
        const targetId = symbolMap.get(resolvedName);
        if (targetId) {
          const range: CallSiteRange = {
            start: callExpr.getStartLineNumber(),
            end: callExpr.getEndLineNumber(),
          };
          const sites = callSitesByTarget.get(targetId) ?? [];
          sites.push(range);
          callSitesByTarget.set(targetId, sites);
        }
      }
    }
  }

  // Create edges with call sites
  for (const [targetId, sites] of callSitesByTarget) {
    edges.push({
      source: callerId,
      target: targetId,
      type: "CALLS",
      callCount: sites.length,
      callSites: sites,
    });
  }
};
