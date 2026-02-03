import type { NodeType } from "@ts-graph/shared";
import {
  type ArrowFunction,
  type CallExpression,
  type ConstructorDeclaration,
  type FunctionDeclaration,
  type GetAccessorDeclaration,
  type JsxOpeningElement,
  type JsxSelfClosingElement,
  type MethodDeclaration,
  type SetAccessorDeclaration,
  type SourceFile,
  SyntaxKind,
  Node as TsMorphNode,
} from "ts-morph";
import type { CallSiteRange, Edge } from "../../../db/Types.js";
import { deriveProjectRoot } from "../../deriveProjectRoot.js";
import { generateNodeId } from "../../generateNodeId.js";
import { normalizePath } from "../../normalizePath.js";
import type { ProjectRegistry } from "../../ProjectRegistry.js";
import { buildImportMap } from "./buildImportMap.js";
import type { EdgeExtractionContext } from "./EdgeExtractionContext.js";
import { followAliasChain } from "./followAliasChain.js";

/**
 * Detect the node type from a declaration.
 */
const getNodeTypeFromDeclaration = (declaration: TsMorphNode): NodeType => {
  if (TsMorphNode.isFunctionDeclaration(declaration)) {
    return "Function";
  }
  if (TsMorphNode.isVariableDeclaration(declaration)) {
    const initializer = declaration.getInitializer();
    if (
      initializer &&
      (TsMorphNode.isArrowFunction(initializer) ||
        TsMorphNode.isFunctionExpression(initializer))
    ) {
      return "Function";
    }
    return "Variable";
  }
  if (TsMorphNode.isClassDeclaration(declaration)) {
    return "Class";
  }
  if (
    TsMorphNode.isMethodDeclaration(declaration) ||
    TsMorphNode.isGetAccessorDeclaration(declaration) ||
    TsMorphNode.isSetAccessorDeclaration(declaration)
  ) {
    return "Method";
  }
  if (TsMorphNode.isInterfaceDeclaration(declaration)) {
    return "Interface";
  }
  if (TsMorphNode.isTypeAliasDeclaration(declaration)) {
    return "TypeAlias";
  }
  // Default fallback - most calls are to functions
  return "Function";
};

/**
 * A map from symbol names to their node IDs.
 * Combines local symbols and imported symbols.
 */
type SymbolMap = Map<string, string>;

/**
 * Result of resolving a call target.
 */
interface ResolvedCallTarget {
  /** The target node ID (e.g., "libs/toolkit/src/math/operations.ts:multiply") */
  targetId: string;
  /** The symbol name for display (e.g., "multiply") */
  symbolName: string;
}

/**
 * Resolve a namespace property access call using cross-package resolution.
 *
 * When the namespace is defined via path alias (e.g., `export * as MathUtils from "@/math"`),
 * the symbol resolution in the caller's tsconfig context fails. This function uses
 * projectRegistry to re-resolve in the correct package's context.
 *
 * @example
 * // In toolkit/index.ts: export * as MathUtils from "@/math"
 * // In backend/api.ts: import { MathUtils } from "@libs/toolkit"; MathUtils.multiply()
 * // The backend tsconfig doesn't know @/math, so we use toolkit's context to resolve
 */
const resolveNamespaceCallCrossPackage = (
  expression: ReturnType<CallExpression["getExpression"]>,
  symbolMap: SymbolMap,
  projectRoot: string,
  projectRegistry?: ProjectRegistry,
): ResolvedCallTarget | undefined => {
  if (!projectRegistry || !TsMorphNode.isPropertyAccessExpression(expression)) {
    return undefined;
  }

  // Get the base object and property name
  const baseExpr = expression.getExpression();
  const propertyName = expression.getName();

  // Get the base object name (e.g., "MathUtils" from "MathUtils.multiply")
  const baseName = TsMorphNode.isIdentifier(baseExpr)
    ? baseExpr.getText()
    : null;
  if (!baseName) {
    return undefined;
  }

  // Look up the namespace in the symbolMap to find the barrel file
  const namespaceId = symbolMap.get(baseName);
  if (!namespaceId) {
    return undefined;
  }

  // The namespaceId points to the barrel file where the namespace is defined
  // Format: "{path}:{type}:{symbol}", e.g., "libs/toolkit/src/index.ts:Function:MathUtils"
  const firstColonIndex = namespaceId.indexOf(":");
  const lastColonIndex = namespaceId.lastIndexOf(":");
  if (firstColonIndex === -1) {
    return undefined;
  }

  const barrelRelativePath = namespaceId.substring(0, firstColonIndex);
  const barrelAbsolutePath = projectRoot + barrelRelativePath;

  // Extract the original namespace name from the symbolMap value
  // e.g., "libs/toolkit/src/index.ts:Function:MathUtils" -> "MathUtils"
  // This is needed when the import is aliased: import { MathUtils as M }
  const originalNamespaceName = namespaceId.substring(lastColonIndex + 1);

  // Get the correct Project context for the barrel file
  const barrelProject = projectRegistry.getProjectForFile(barrelAbsolutePath);
  if (!barrelProject) {
    return undefined;
  }

  // Get the barrel file in the correct context
  const barrelFile = barrelProject.getSourceFile(barrelAbsolutePath);
  if (!barrelFile) {
    return undefined;
  }

  // Find the namespace export and resolve the property within it
  for (const exportDecl of barrelFile.getExportDeclarations()) {
    const namespaceExport = exportDecl.getNamespaceExport();
    if (
      namespaceExport &&
      namespaceExport.getName() === originalNamespaceName
    ) {
      // Found the namespace export (e.g., export * as MathUtils from "@/math")
      // Now resolve the module specifier to find where the property is defined
      const resolvedModule = exportDecl.getModuleSpecifierSourceFile();
      if (resolvedModule) {
        // Look for the exported symbol in the resolved module
        for (const expSymbol of resolvedModule.getExportSymbols()) {
          if (expSymbol.getName() === propertyName) {
            // Found the symbol - follow alias chain to get actual definition
            const actualSymbol = followAliasChain(expSymbol);
            const declarations = actualSymbol.getDeclarations();
            const declaration = declarations[0];

            if (declaration) {
              const declarationFile = declaration.getSourceFile();
              const absolutePath = normalizePath(declarationFile.getFilePath());

              if (absolutePath.startsWith(projectRoot)) {
                const relativePath = absolutePath.slice(projectRoot.length);
                const symbolName = actualSymbol.getName();
                const nodeType = getNodeTypeFromDeclaration(declaration);
                const targetId = `${relativePath}:${nodeType}:${symbolName}`;
                return { targetId, symbolName };
              }
            }
          }
        }
      }
    }
  }

  return undefined;
};

/**
 * Resolve a call expression target to its actual definition.
 *
 * Handles:
 * - Simple calls: `foo()` → looks up `foo` in symbolMap
 * - Property access on namespaces: `MathUtils.multiply()` → resolves through namespace
 * - Method calls on objects: `obj.method()` → looks up `obj` in symbolMap
 *
 * @param callExpr - The call expression to resolve
 * @param symbolMap - Map of known symbols
 * @param aliasMap - Map of local variable aliases
 * @param projectRoot - Project root for computing relative paths
 * @param projectRegistry - Optional registry for cross-package namespace resolution
 * @returns The resolved target, or undefined if not resolvable
 */
const resolveCallTarget = (
  callExpr: CallExpression,
  symbolMap: SymbolMap,
  aliasMap: Map<string, string>,
  projectRoot: string,
  projectRegistry?: ProjectRegistry,
): ResolvedCallTarget | undefined => {
  const expression = callExpr.getExpression();

  // Case 1: PropertyAccessExpression (e.g., MathUtils.multiply(), obj.method())
  if (TsMorphNode.isPropertyAccessExpression(expression)) {
    // Try to resolve through the type system (handles namespace imports)
    const symbol = expression.getSymbol();
    if (symbol) {
      const actualSymbol = followAliasChain(symbol);
      const declarations = actualSymbol.getDeclarations();
      const declaration = declarations[0];

      if (declaration) {
        const declarationFile = declaration.getSourceFile();
        const absolutePath = normalizePath(declarationFile.getFilePath());

        // Skip built-in types (declarations outside project root or in node_modules)
        // This filters out Math.min, Array.map, String.prototype methods, etc.
        const isBuiltIn =
          !projectRoot ||
          !absolutePath.startsWith(projectRoot) ||
          absolutePath.includes("/node_modules/");

        if (isBuiltIn) {
          // Built-in method call (Array.map, String.split, etc.)
          // Don't create a CALLS edge - the method belongs to the built-in type,
          // not to the imported variable that holds the data.
          return undefined;
        }

        // Convert to relative path
        const relativePath = absolutePath.slice(projectRoot.length);

        const symbolName = actualSymbol.getName();

        // Check if this is a class member - if so, include the class name
        // Handles methods, arrow function properties, and getters/setters
        let targetId: string;
        const nodeType = getNodeTypeFromDeclaration(declaration);
        if (
          TsMorphNode.isMethodDeclaration(declaration) ||
          TsMorphNode.isPropertyDeclaration(declaration) ||
          TsMorphNode.isGetAccessorDeclaration(declaration) ||
          TsMorphNode.isSetAccessorDeclaration(declaration)
        ) {
          const classDecl = declaration.getParent();
          if (TsMorphNode.isClassDeclaration(classDecl)) {
            const className = classDecl.getName();
            if (className) {
              targetId = `${relativePath}:${nodeType}:${className}.${symbolName}`;
            } else {
              targetId = `${relativePath}:${nodeType}:${symbolName}`;
            }
          } else {
            targetId = `${relativePath}:${nodeType}:${symbolName}`;
          }
        } else {
          targetId = `${relativePath}:${nodeType}:${symbolName}`;
        }

        return { targetId, symbolName };
      }
    }

    // Symbol resolution failed - try cross-package namespace resolution
    // This handles: import { MathUtils } from "@libs/toolkit"; MathUtils.multiply()
    // where the namespace is defined via path alias: export * as MathUtils from "@/math"
    const crossPackageResult = resolveNamespaceCallCrossPackage(
      expression,
      symbolMap,
      projectRoot,
      projectRegistry,
    );
    if (crossPackageResult) {
      return crossPackageResult;
    }

    // Fallback: use the base object from symbolMap (original behavior)
    const baseText = expression.getExpression().getText();
    const baseName = baseText.split(".")[0] ?? baseText;
    const resolvedName = aliasMap.get(baseName) ?? baseName;
    const targetId = symbolMap.get(resolvedName);

    if (targetId) {
      return { targetId, symbolName: resolvedName };
    }

    return undefined;
  }

  // Case 2: Simple Identifier (e.g., foo())
  if (TsMorphNode.isIdentifier(expression)) {
    const calleeName = expression.getText();
    const resolvedName = aliasMap.get(calleeName) ?? calleeName;
    const targetId = symbolMap.get(resolvedName);

    if (targetId) {
      return { targetId, symbolName: resolvedName };
    }

    return undefined;
  }

  // Case 3: Other expressions - try to extract first identifier
  const text = expression.getText();
  const calleeName = text.split(".")[0] ?? text;
  const resolvedName = aliasMap.get(calleeName) ?? calleeName;
  const targetId = symbolMap.get(resolvedName);

  if (targetId) {
    return { targetId, symbolName: resolvedName };
  }

  return undefined;
};

/**
 * Resolve a JSX element tag to its component definition.
 *
 * Handles:
 * - Simple JSX: `<MyComponent />` → looks up `MyComponent` in symbolMap
 * - Skips intrinsic elements: `<div>`, `<span>` (lowercase first letter)
 *
 * @param jsxElement - The JSX opening or self-closing element
 * @param symbolMap - Map of known symbols
 * @param projectRoot - Project root for computing relative paths
 * @returns The resolved target, or undefined if not resolvable
 */
const resolveJsxTarget = (
  jsxElement: JsxOpeningElement | JsxSelfClosingElement,
  symbolMap: SymbolMap,
  projectRoot: string,
): ResolvedCallTarget | undefined => {
  const tagNameNode = jsxElement.getTagNameNode();
  const tagName = tagNameNode.getText();

  // Skip intrinsic elements (lowercase first letter means HTML element)
  if (tagName[0] === tagName[0]?.toLowerCase()) {
    return undefined;
  }

  // Try to resolve through the type system first
  const symbol = tagNameNode.getSymbol();
  if (symbol) {
    const actualSymbol = followAliasChain(symbol);
    const declarations = actualSymbol.getDeclarations();
    const declaration = declarations[0];

    if (declaration) {
      const declarationFile = declaration.getSourceFile();
      const absolutePath = normalizePath(declarationFile.getFilePath());

      // Skip external modules (but fall through to symbolMap lookup)
      if (
        absolutePath.startsWith(projectRoot) &&
        !absolutePath.includes("/node_modules/")
      ) {
        const relativePath = absolutePath.slice(projectRoot.length);
        const symbolName = actualSymbol.getName();
        const nodeType = getNodeTypeFromDeclaration(declaration);
        const targetId = `${relativePath}:${nodeType}:${symbolName}`;
        return { targetId, symbolName };
      }
    }
  }

  // Fallback: look up in symbolMap (handles cross-package imports via import map)
  const targetId = symbolMap.get(tagName);
  if (targetId) {
    return { targetId, symbolName: tagName };
  }

  return undefined;
};

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

  // Derive project root for resolving absolute paths
  const absolutePath = normalizePath(sourceFile.getFilePath());
  const projectRoot = deriveProjectRoot(absolutePath, context.filePath);

  // Build combined symbol map from local definitions + imports
  const symbolMap = buildCombinedSymbolMap(sourceFile, context);

  // Find all functions and methods
  const functions = sourceFile.getFunctions();
  const variables = sourceFile.getVariableDeclarations();
  const classes = sourceFile.getClasses();

  // Extract calls from functions
  for (const func of functions) {
    const funcName = func.getName();
    if (!funcName) continue;

    const callerId = generateNodeId(context.filePath, "Function", funcName);
    extractCallsFromCallable(
      func,
      callerId,
      symbolMap,
      edges,
      projectRoot,
      context.projectRegistry,
    );
  }

  // Extract calls from arrow functions assigned to variables
  for (const variable of variables) {
    const varName = variable.getName();
    const initializer = variable.getInitializer();

    if (initializer && TsMorphNode.isArrowFunction(initializer)) {
      const callerId = generateNodeId(context.filePath, "Function", varName);
      extractCallsFromCallable(
        initializer,
        callerId,
        symbolMap,
        edges,
        projectRoot,
        context.projectRegistry,
      );
    }
  }

  // Extract calls from methods and constructors
  for (const classDecl of classes) {
    const className = classDecl.getName();
    if (!className) continue;

    const methods = classDecl.getMethods();
    for (const method of methods) {
      const methodName = method.getName();
      const callerId = generateNodeId(
        context.filePath,
        "Method",
        `${className}.${methodName}`,
      );
      extractCallsFromCallable(
        method,
        callerId,
        symbolMap,
        edges,
        projectRoot,
        context.projectRegistry,
      );
    }

    // Extract calls from constructors - attributed to the class
    const constructors = classDecl.getConstructors();
    for (const ctor of constructors) {
      const callerId = generateNodeId(context.filePath, "Class", className);
      extractCallsFromCallable(
        ctor,
        callerId,
        symbolMap,
        edges,
        projectRoot,
        context.projectRegistry,
      );
    }

    // Extract calls from getters
    for (const getter of classDecl.getGetAccessors()) {
      const getterName = getter.getName();
      const callerId = `${context.filePath}:${className}.${getterName}:get`;
      extractCallsFromCallable(
        getter,
        callerId,
        symbolMap,
        edges,
        projectRoot,
        context.projectRegistry,
      );
    }

    // Extract calls from setters
    for (const setter of classDecl.getSetAccessors()) {
      const setterName = setter.getName();
      const callerId = `${context.filePath}:${className}.${setterName}:set`;
      extractCallsFromCallable(
        setter,
        callerId,
        symbolMap,
        edges,
        projectRoot,
        context.projectRegistry,
      );
    }

    // Extract calls from class properties (arrow functions and initializers)
    for (const property of classDecl.getProperties()) {
      const initializer = property.getInitializer();
      if (!initializer) {
        continue;
      }

      // Class property initializers - attributed to the class
      const callerId = generateNodeId(context.filePath, "Class", className);

      if (TsMorphNode.isArrowFunction(initializer)) {
        // Arrow function property: extract calls from the arrow function body
        extractCallsFromCallable(
          initializer,
          callerId,
          symbolMap,
          edges,
          projectRoot,
          context.projectRegistry,
        );
      } else {
        // Non-arrow initializer: extract calls directly from the initializer expression
        extractCallsFromNode(
          initializer,
          callerId,
          symbolMap,
          edges,
          projectRoot,
          context.projectRegistry,
        );
      }
    }

    // Extract calls from static initializer blocks
    for (const staticBlock of classDecl.getStaticBlocks()) {
      const callerId = `${context.filePath}:${className}.static`;
      extractCallsFromNode(
        staticBlock,
        callerId,
        symbolMap,
        edges,
        projectRoot,
        context.projectRegistry,
      );
    }
  }

  // Extract calls from class expressions assigned to variables
  for (const variable of variables) {
    const varName = variable.getName();
    const initializer = variable.getInitializer();

    if (initializer && TsMorphNode.isClassExpression(initializer)) {
      // Class expression - extract calls from its methods
      for (const method of initializer.getMethods()) {
        const methodName = method.getName();
        const callerId = generateNodeId(
          context.filePath,
          "Method",
          `${varName}.${methodName}`,
        );
        extractCallsFromCallable(
          method,
          callerId,
          symbolMap,
          edges,
          projectRoot,
          context.projectRegistry,
        );
      }
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
  context: EdgeExtractionContext,
): SymbolMap => {
  const map: SymbolMap = new Map();

  // 1. Add local symbols (defined in this file)
  addLocalSymbols(map, sourceFile, context.filePath);

  // 2. Add imported symbols (from import declarations)
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
      map.set(name, generateNodeId(filePath, "Function", name));
    }
  }

  // Arrow functions and other variables
  for (const variable of sourceFile.getVariableDeclarations()) {
    const name = variable.getName();
    const initializer = variable.getInitializer();
    // Arrow functions are extracted as Function nodes
    const nodeType =
      initializer && TsMorphNode.isArrowFunction(initializer)
        ? "Function"
        : "Variable";
    map.set(name, generateNodeId(filePath, nodeType, name));
  }

  // Classes and their methods
  for (const classDecl of sourceFile.getClasses()) {
    const className = classDecl.getName();
    if (className) {
      map.set(className, generateNodeId(filePath, "Class", className));

      // Add methods
      for (const method of classDecl.getMethods()) {
        const methodName = method.getName();
        map.set(
          methodName,
          generateNodeId(filePath, "Method", `${className}.${methodName}`),
        );
      }
    }
  }

  // Interfaces
  for (const iface of sourceFile.getInterfaces()) {
    const name = iface.getName();
    map.set(name, generateNodeId(filePath, "Interface", name));
  }

  // Type aliases
  for (const typeAlias of sourceFile.getTypeAliases()) {
    const name = typeAlias.getName();
    map.set(name, generateNodeId(filePath, "TypeAlias", name));
  }
};

/**
 * Build a map of local variable aliases within a callable body.
 * Maps variable names to their original symbol names when assigned from known symbols.
 * E.g., `const fn = target` creates alias: fn -> target
 */
const buildLocalAliasMap = (
  callable:
    | FunctionDeclaration
    | ArrowFunction
    | MethodDeclaration
    | ConstructorDeclaration
    | GetAccessorDeclaration
    | SetAccessorDeclaration,
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
 * Extract call expressions from any AST node (property initializers, static blocks, etc.).
 */
const extractCallsFromNode = (
  node: TsMorphNode,
  callerId: string,
  symbolMap: SymbolMap,
  edges: Edge[],
  projectRoot: string,
  projectRegistry?: ProjectRegistry,
): void => {
  const aliasMap = new Map<string, string>();
  const callSitesByTarget = new Map<string, CallSiteRange[]>();

  const callExpressions = node.getDescendantsOfKind(SyntaxKind.CallExpression);

  // Also check if the node itself is a call expression
  if (TsMorphNode.isCallExpression(node)) {
    callExpressions.unshift(node);
  }

  for (const callExpr of callExpressions) {
    const resolved = resolveCallTarget(
      callExpr,
      symbolMap,
      aliasMap,
      projectRoot,
      projectRegistry,
    );

    if (resolved) {
      const range: CallSiteRange = {
        start: callExpr.getStartLineNumber(),
        end: callExpr.getEndLineNumber(),
      };
      const sites = callSitesByTarget.get(resolved.targetId) ?? [];
      sites.push(range);
      callSitesByTarget.set(resolved.targetId, sites);
    }
  }

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

/**
 * Extract call expressions from a callable (function, arrow function, method, or constructor).
 */
const extractCallsFromCallable = (
  callable:
    | FunctionDeclaration
    | ArrowFunction
    | MethodDeclaration
    | ConstructorDeclaration
    | GetAccessorDeclaration
    | SetAccessorDeclaration,
  callerId: string,
  symbolMap: SymbolMap,
  edges: Edge[],
  projectRoot: string,
  projectRegistry?: ProjectRegistry,
): void => {
  // Nodes to search for call expressions
  const nodesToSearch: TsMorphNode[] = [];

  // Add function/method body
  const body = callable.getBody();
  if (body) {
    nodesToSearch.push(body);
  }

  // Add parameter default values (e.g., function foo(x = getDefault()) {...})
  const parameters = callable.getParameters();
  for (const param of parameters) {
    const initializer = param.getInitializer();
    if (initializer) {
      nodesToSearch.push(initializer);
    }
  }

  if (nodesToSearch.length === 0) {
    return;
  }

  // Build alias map for local variables that reference known symbols
  const aliasMap = buildLocalAliasMap(callable, symbolMap);

  // Collect call site ranges for each target (CALLS edges)
  const callSitesByTarget = new Map<string, CallSiteRange[]>();
  // Collect JSX usage sites for each target (INCLUDES edges)
  const jsxSitesByTarget = new Map<string, CallSiteRange[]>();

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
      // Use the new resolver that handles namespace property access
      const resolved = resolveCallTarget(
        callExpr,
        symbolMap,
        aliasMap,
        projectRoot,
        projectRegistry,
      );

      if (resolved) {
        const range: CallSiteRange = {
          start: callExpr.getStartLineNumber(),
          end: callExpr.getEndLineNumber(),
        };
        const sites = callSitesByTarget.get(resolved.targetId) ?? [];
        sites.push(range);
        callSitesByTarget.set(resolved.targetId, sites);
      }
    }

    // Get all JSX elements (opening and self-closing)
    const jsxElements: (JsxOpeningElement | JsxSelfClosingElement)[] = [
      ...nodeToSearch.getDescendantsOfKind(SyntaxKind.JsxOpeningElement),
      ...nodeToSearch.getDescendantsOfKind(SyntaxKind.JsxSelfClosingElement),
    ];

    for (const jsxElement of jsxElements) {
      const resolved = resolveJsxTarget(jsxElement, symbolMap, projectRoot);

      if (resolved) {
        const range: CallSiteRange = {
          start: jsxElement.getStartLineNumber(),
          end: jsxElement.getEndLineNumber(),
        };
        const sites = jsxSitesByTarget.get(resolved.targetId) ?? [];
        sites.push(range);
        jsxSitesByTarget.set(resolved.targetId, sites);
      }
    }
  }

  // Create CALLS edges
  for (const [targetId, sites] of callSitesByTarget) {
    edges.push({
      source: callerId,
      target: targetId,
      type: "CALLS",
      callCount: sites.length,
      callSites: sites,
    });
  }

  // Create INCLUDES edges for JSX
  for (const [targetId, sites] of jsxSitesByTarget) {
    edges.push({
      source: callerId,
      target: targetId,
      type: "INCLUDES",
      callCount: sites.length,
      callSites: sites,
    });
  }
};
