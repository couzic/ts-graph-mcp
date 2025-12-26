import type { SourceFile } from "ts-morph";

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
  const absolutePath = sourceFile.getFilePath().replace(/\\/g, "/");
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
          addImportsToMap(map, importDecl, targetPath, includeTypeImports);
        }
      }
      continue;
    }

    // Get target file's relative path
    const targetAbsolutePath = resolvedSourceFile
      .getFilePath()
      .replace(/\\/g, "/");
    const targetPath = targetAbsolutePath.startsWith(projectRoot)
      ? targetAbsolutePath.slice(projectRoot.length)
      : targetAbsolutePath;

    addImportsToMap(map, importDecl, targetPath, includeTypeImports);
  }

  return map;
};

/**
 * Add imports from an import declaration to the map.
 */
const addImportsToMap = (
  map: ImportMap,
  importDecl: ReturnType<SourceFile["getImportDeclarations"]>[number],
  targetPath: string,
  includeTypeImports: boolean,
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

    // Construct target node ID directly: targetPath:symbolName
    const targetId = `${targetPath}:${originalName}`;
    map.set(localName, targetId);
  }

  // Process default imports: import utils from './utils'
  const defaultImport = importDecl.getDefaultImport();
  if (defaultImport) {
    const localName = defaultImport.getText();
    // For default exports, we use 'default' as the symbol name
    // This is a simplification - default exports may have different names
    const targetId = `${targetPath}:default`;
    map.set(localName, targetId);
  }

  // Note: Namespace imports (import * as utils from './utils') are not
  // directly added since they're accessed as utils.foo() which requires
  // different resolution logic
};

/**
 * Derive the project root from an absolute path and its known relative path.
 * Example: absolute="/home/user/project/src/file.ts", relative="src/file.ts"
 *          => projectRoot="/home/user/project/"
 */
const deriveProjectRoot = (
  absolutePath: string,
  relativePath: string,
): string => {
  if (absolutePath.endsWith(relativePath)) {
    return absolutePath.slice(0, absolutePath.length - relativePath.length);
  }
  // Fallback: if paths don't match, return empty (will use absolute paths)
  return "";
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
