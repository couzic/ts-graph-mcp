import type { NodeType } from "@ts-graph/shared";
import { type ImportSpecifier, Node, type SourceFile } from "ts-morph";
import { deriveProjectRoot } from "../../deriveProjectRoot.js";
import { normalizePath } from "../../normalizePath.js";
import type { ProjectRegistry } from "../../ProjectRegistry.js";
import { followAliasChain } from "./followAliasChain.js";

/**
 * A map from local symbol names to their target node IDs.
 * Built from import declarations without needing a global nodes array.
 *
 * This enables memory-efficient streaming ingestion by resolving cross-file
 * edges using only the current file's imports (~100 entries max) rather than
 * holding all nodes in memory (potentially millions of entries).
 *
 * @example
 * // For file: frontend/src/App.ts
 * // Import: import { User } from '@shared/types'
 * // Map entry: "User" -> "shared/src/types.ts:User"
 */
export type ImportMap = Map<string, string>;

/**
 * Options for building an import map.
 */
export interface BuildImportMapOptions {
  /**
   * Include type-only imports in the map.
   * Default: false (skip type-only imports since they can't be called).
   * Set to true when building a map for USES_TYPE edge resolution.
   */
  includeTypeImports?: boolean;
  /**
   * Registry for cross-package resolution.
   * Used when barrel files use path aliases that need a different tsconfig context.
   */
  projectRegistry?: ProjectRegistry;
}

/**
 * Build a map from imported symbol names to their target node IDs.
 *
 * This is the simplified version that doesn't require a global nodes array.
 * Instead, it constructs target node IDs directly from:
 * - Target file path (resolved by ts-morph)
 * - Symbol name (from the import declaration)
 *
 * @param sourceFile - The source file AST
 * @param filePath - The relative path of the source file
 * @param options - Optional: Configuration options
 * @returns A map from local symbol names to target node IDs
 */
export const buildImportMap = (
  sourceFile: SourceFile,
  filePath: string,
  options?: BuildImportMapOptions,
): ImportMap => {
  const map: ImportMap = new Map();
  const includeTypeImports = options?.includeTypeImports ?? false;

  // Derive project root from source file path
  const absolutePath = normalizePath(sourceFile.getFilePath());
  const projectRoot = deriveProjectRoot(absolutePath, filePath);

  const imports = sourceFile.getImportDeclarations();

  for (const importDecl of imports) {
    // Skip type-only imports unless includeTypeImports is true
    if (importDecl.isTypeOnly() && !includeTypeImports) {
      continue;
    }

    // Use ts-morph to resolve the import (handles path aliases like @shared/*)
    const resolvedSourceFile = importDecl.getModuleSpecifierSourceFile();
    if (!resolvedSourceFile) {
      // Could not resolve - might be external module or unresolvable
      // Try fallback for relative imports
      const moduleSpecifier = importDecl.getModuleSpecifierValue();
      if (moduleSpecifier.startsWith(".") || moduleSpecifier.startsWith("/")) {
        const targetPath = resolveRelativeImport(filePath, moduleSpecifier);
        if (targetPath) {
          addImportsToMap(
            map,
            importDecl,
            targetPath,
            includeTypeImports,
            projectRoot,
            options?.projectRegistry,
          );
        }
      }
      continue;
    }

    // Get target file's relative path
    const targetAbsolutePath = normalizePath(resolvedSourceFile.getFilePath());
    const targetPath = targetAbsolutePath.startsWith(projectRoot)
      ? targetAbsolutePath.slice(projectRoot.length)
      : targetAbsolutePath;

    addImportsToMap(
      map,
      importDecl,
      targetPath,
      includeTypeImports,
      projectRoot,
      options?.projectRegistry,
    );
  }

  return map;
};

interface ResolvedDefinition {
  path: string;
  symbolName: string;
  nodeType: NodeType;
}

/**
 * Detect the node type from a declaration.
 */
const getNodeTypeFromDeclaration = (declaration: Node): NodeType => {
  if (Node.isFunctionDeclaration(declaration)) {
    return "Function";
  }
  if (Node.isVariableDeclaration(declaration)) {
    const initializer = declaration.getInitializer();
    if (
      initializer &&
      (Node.isArrowFunction(initializer) ||
        Node.isFunctionExpression(initializer))
    ) {
      return "Function";
    }
    return "Variable";
  }
  if (Node.isClassDeclaration(declaration)) {
    return "Class";
  }
  if (Node.isMethodDeclaration(declaration)) {
    return "Method";
  }
  if (Node.isInterfaceDeclaration(declaration)) {
    return "Interface";
  }
  if (Node.isTypeAliasDeclaration(declaration)) {
    return "TypeAlias";
  }
  // Default fallback - most imports that aren't types are functions
  return "Function";
};

/**
 * Extract the actual name from a declaration node.
 * For default exports of named classes/functions, returns the class/function name.
 * Returns null if no name can be extracted.
 */
const getDeclarationName = (declaration: Node): string | null => {
  if (Node.isClassDeclaration(declaration)) {
    return declaration.getName() ?? null;
  }
  if (Node.isFunctionDeclaration(declaration)) {
    return declaration.getName() ?? null;
  }
  return null;
};

/**
 * Resolve a symbol to its definition location within the project.
 * Follows alias chains and returns the relative path if within project root.
 *
 * @example
 * const result = resolveSymbolDefinition(symbol, "/home/user/project/");
 * // Returns: { path: "src/utils.ts", symbolName: "formatDate" } or null
 */
const resolveSymbolDefinition = (
  symbol: ReturnType<typeof followAliasChain>,
  projectRoot: string,
): ResolvedDefinition | null => {
  const actualSymbol = followAliasChain(symbol);
  const declaration = actualSymbol.getDeclarations()[0];
  if (!declaration) {
    return null;
  }

  const absolutePath = normalizePath(declaration.getSourceFile().getFilePath());

  if (!absolutePath.startsWith(projectRoot)) {
    return null;
  }

  // For default exports, try to get the actual name from the declaration
  // (e.g., `export default class User {}` → "User")
  let symbolName = actualSymbol.getName();
  if (symbolName === "default") {
    const declarationName = getDeclarationName(declaration);
    if (declarationName) {
      symbolName = declarationName;
    }
  }

  return {
    path: absolutePath.slice(projectRoot.length),
    symbolName,
    nodeType: getNodeTypeFromDeclaration(declaration),
  };
};

/**
 * Resolve the actual definition location for a named import.
 * Follows re-export chains (e.g., `export * from './helpers'`) to find
 * where the symbol is actually defined, not just where it's re-exported.
 *
 * Handles cross-package path aliases by using the projectRegistry to
 * re-resolve with the correct tsconfig context when needed.
 *
 * @param namedImport - The named import specifier
 * @param projectRoot - The project root for computing relative paths
 * @param fallbackPath - The import target path (used if resolution fails)
 * @param fallbackSymbolName - The symbol name (used if resolution fails)
 * @param projectRegistry - Registry for cross-package resolution
 * @returns The actual definition path and symbol name
 */
const resolveActualDefinition = (
  namedImport: ImportSpecifier,
  projectRoot: string,
  fallbackPath: string,
  fallbackSymbolName: string,
  projectRegistry?: ProjectRegistry,
): ResolvedDefinition => {
  // Default fallback - assume "Function" as most imports are functions
  const fallback: ResolvedDefinition = {
    path: fallbackPath,
    symbolName: fallbackSymbolName,
    nodeType: "Function",
  };
  const nameNode = namedImport.getNameNode();
  const symbol = nameNode.getSymbol();
  if (!symbol) {
    return fallback;
  }

  // Follow alias chains to get the actual symbol
  // This handles: export { foo } from './other' and export * from './other'
  const actualSymbol = followAliasChain(symbol);

  // Get the declarations of the actual symbol
  const declarations = actualSymbol.getDeclarations();
  const declaration = declarations[0];

  // Check if followAliasChain failed to resolve (returns "unknown" symbol with no declarations)
  // This happens when the barrel file uses a path alias that couldn't be resolved
  // because we're in a different package's tsconfig context.
  const resolutionFailed = !declaration || actualSymbol.getName() === "unknown";

  if (resolutionFailed && projectRegistry) {
    // Try cross-package resolution
    // Get the barrel file from the import declaration
    const importDecl = namedImport.getImportDeclaration();
    const barrelFile = importDecl.getModuleSpecifierSourceFile();

    if (barrelFile) {
      const barrelAbsolutePath = normalizePath(barrelFile.getFilePath());
      const importedName = namedImport.getName(); // The name we're importing (e.g., "LoadingWrapper")

      // Get the Project for the barrel file's package
      const barrelProject =
        projectRegistry.getProjectForFile(barrelAbsolutePath);
      if (barrelProject) {
        // Get the barrel file from the correct Project (with correct tsconfig context)
        const barrelInCorrectContext =
          barrelProject.getSourceFile(barrelAbsolutePath);
        if (barrelInCorrectContext) {
          // Find the export for this symbol in the correctly-contexted barrel file
          const result = resolveExportInBarrel(
            barrelInCorrectContext,
            importedName,
            projectRoot,
          );
          if (result) {
            return result;
          }
        }
      }
    }

    return fallback;
  }

  if (!declaration) {
    return fallback;
  }

  // Get the source file of the first declaration
  const declarationFile = declaration.getSourceFile();
  const absolutePath = normalizePath(declarationFile.getFilePath());

  // Convert to relative path
  if (absolutePath.startsWith(projectRoot)) {
    // Get the actual symbol name
    // For namespace re-exports (export * as Name), getName() may return the file path
    // In that case, fall back to the imported name
    const resolvedName = actualSymbol.getName();
    const symbolName = resolvedName.includes("/")
      ? fallbackSymbolName
      : resolvedName;

    return {
      path: absolutePath.slice(projectRoot.length),
      symbolName,
      nodeType: getNodeTypeFromDeclaration(declaration),
    };
  }
  // Declaration outside project root - use fallback (the import target path)
  return fallback;
};

/**
 * Find an exported symbol by name and resolve its definition.
 *
 * @example
 * findExportedSymbol(sourceFile, "formatDate", "/project/") // { path: "src/utils.ts", symbolName: "formatDate" }
 */
const findExportedSymbol = (
  sourceFile: SourceFile,
  symbolName: string,
  projectRoot: string,
): ResolvedDefinition | null => {
  for (const expSymbol of sourceFile.getExportSymbols()) {
    if (expSymbol.getName() === symbolName) {
      return resolveSymbolDefinition(expSymbol, projectRoot);
    }
  }
  return null;
};

/**
 * Resolve an export in a barrel file to its actual definition location.
 * Used when cross-package path alias resolution is needed.
 */
const resolveExportInBarrel = (
  barrelFile: ReturnType<typeof Node.prototype.getSourceFile>,
  exportedName: string,
  projectRoot: string,
): ResolvedDefinition | null => {
  // Check export declarations (re-exports)
  for (const exportDecl of barrelFile.getExportDeclarations()) {
    const namedExports = exportDecl.getNamedExports();

    // Handle star exports: export * from './file'
    if (namedExports.length === 0 && exportDecl.hasModuleSpecifier()) {
      const resolvedFile = exportDecl.getModuleSpecifierSourceFile();
      if (resolvedFile) {
        const resolved = findExportedSymbol(
          resolvedFile,
          exportedName,
          projectRoot,
        );
        if (resolved) {
          return resolved;
        }
      }
      continue;
    }

    // Handle named exports: export { foo } from './file'
    for (const namedExport of namedExports) {
      // Check if this export matches our name
      // For "export { default as LoadingWrapper }", getAliasNode() returns "LoadingWrapper"
      const aliasNode = namedExport.getAliasNode();
      const exportName = aliasNode
        ? aliasNode.getText()
        : namedExport.getName();

      if (exportName === exportedName) {
        // Found the export - now resolve the module specifier
        const resolvedFile = exportDecl.getModuleSpecifierSourceFile();
        if (resolvedFile) {
          // Check if this is a "default as X" pattern
          const originalName = namedExport.getName(); // The name before alias
          if (originalName === "default") {
            // Find the default export in the resolved file
            const defaultSymbol = resolvedFile.getDefaultExportSymbol();
            if (defaultSymbol) {
              const resolved = resolveSymbolDefinition(
                defaultSymbol,
                projectRoot,
              );
              if (resolved) {
                return resolved;
              }
            }
          } else {
            // Named export - find the actual symbol in the resolved file
            const resolved = findExportedSymbol(
              resolvedFile,
              originalName,
              projectRoot,
            );
            if (resolved) {
              return resolved;
            }
          }
        }
      }
    }
  }

  return null;
};

/**
 * Add imports from an import declaration to the map.
 */
const addImportsToMap = (
  map: ImportMap,
  importDecl: ReturnType<SourceFile["getImportDeclarations"]>[number],
  targetPath: string,
  includeTypeImports: boolean,
  projectRoot: string,
  projectRegistry?: ProjectRegistry,
): void => {
  // Process named imports: import { formatDate, parseDate as pd } from './utils'
  const namedImports = importDecl.getNamedImports();
  for (const namedImport of namedImports) {
    // Skip type-only named imports unless includeTypeImports is true
    if (namedImport.isTypeOnly() && !includeTypeImports) {
      continue;
    }

    // getName() returns the original exported name (e.g., "formatDate")
    const originalName = namedImport.getName();

    // getAliasNode() returns the local alias if one exists (e.g., "fd" in "formatDate as fd")
    const aliasNode = namedImport.getAliasNode();
    const localName = aliasNode ? aliasNode.getText() : originalName;

    // Resolve actual definition location (follows re-exports)
    const resolved = resolveActualDefinition(
      namedImport,
      projectRoot,
      targetPath,
      originalName,
      projectRegistry,
    );

    // Construct target node ID: actualPath:nodeType:symbolName
    const targetId = `${resolved.path}:${resolved.nodeType}:${resolved.symbolName}`;
    map.set(localName, targetId);
  }

  // Process default imports: import utils from './utils'
  const defaultImport = importDecl.getDefaultImport();
  if (defaultImport) {
    const localName = defaultImport.getText();

    // Try to resolve through re-export chains to find actual definition
    const symbol = defaultImport.getSymbol();
    if (symbol) {
      const resolved = resolveSymbolDefinition(symbol, projectRoot);
      if (resolved) {
        const targetId = `${resolved.path}:${resolved.nodeType}:${resolved.symbolName}`;
        map.set(localName, targetId);
        return;
      }
    }

    // Fallback: use targetPath:Function:default (assume function for default exports)
    const targetId = `${targetPath}:Function:default`;
    map.set(localName, targetId);
  }

  // Note: Namespace imports (import * as utils from './utils') are not
  // directly added since they're accessed as utils.foo() which requires
  // different resolution logic
};

/**
 * Resolve a relative import path to a target file path.
 * Used as fallback when ts-morph can't resolve (e.g., in-memory test files).
 *
 * @param sourceFilePath - The file containing the import
 * @param moduleSpecifier - The import path (e.g., './utils' or '../shared/types')
 * @returns The resolved target file path
 */
const resolveRelativeImport = (
  sourceFilePath: string,
  moduleSpecifier: string,
): string => {
  // Get the directory of the source file
  const lastSlash = sourceFilePath.lastIndexOf("/");
  const sourceDir =
    lastSlash >= 0 ? sourceFilePath.substring(0, lastSlash) : "";

  // Resolve the relative path
  const parts = (
    sourceDir ? `${sourceDir}/${moduleSpecifier}` : moduleSpecifier
  )
    .split("/")
    .filter((p) => p !== ".");

  // Process .. to go up directories
  const resolved: string[] = [];
  for (const part of parts) {
    if (part === "..") {
      resolved.pop();
    } else {
      resolved.push(part);
    }
  }

  const basePath = resolved.join("/");

  // Convert JS extensions to TS (ESM pattern: import from .js but source is .ts)
  if (basePath.endsWith(".js")) {
    return `${basePath.slice(0, -3)}.ts`;
  }
  if (basePath.endsWith(".jsx")) {
    return `${basePath.slice(0, -4)}.tsx`;
  }

  // For extensionless imports, add .ts
  if (!basePath.match(/\.[jt]sx?$/)) {
    return `${basePath}.ts`;
  }

  return basePath;
};
