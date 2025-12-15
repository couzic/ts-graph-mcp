import type { SourceFile } from "ts-morph";
import type { Node } from "../../../db/Types.js";

/**
 * A map from symbol names to their node IDs.
 * Used to resolve function/method calls to their target nodes.
 */
export type SymbolMap = Map<string, string>;

/**
 * Options for building a symbol map.
 */
export interface BuildSymbolMapOptions {
	/**
	 * Include type-only imports in the map.
	 * Default: false (skip type-only imports since they can't be called).
	 * Set to true when building a map for USES_TYPE edge resolution.
	 */
	includeTypeImports?: boolean;
}

/**
 * Build a map of symbol names to node IDs for call resolution.
 *
 * Includes:
 * - Symbols defined in the same file
 * - Symbols imported from other files (named imports)
 *
 * @param nodes - All nodes extracted from the codebase
 * @param filePath - The file path to build the symbol map for
 * @param sourceFile - Optional: The source file AST for parsing imports
 * @param options - Optional: Configuration options
 * @returns A map from symbol names to node IDs
 */
export const buildSymbolMap = (
	nodes: Node[],
	filePath: string,
	sourceFile?: SourceFile,
	options?: BuildSymbolMapOptions,
): SymbolMap => {
	const map: SymbolMap = new Map();

	// First, add same-file symbols
	addSameFileSymbols(map, nodes, filePath);

	// Then, add imported symbols if sourceFile is provided
	if (sourceFile) {
		addImportedSymbols(map, nodes, filePath, sourceFile, options);
	}

	return map;
};

/**
 * Add symbols defined in the same file to the map.
 */
const addSameFileSymbols = (
	map: SymbolMap,
	nodes: Node[],
	filePath: string,
): void => {
	for (const node of nodes) {
		if (node.filePath !== filePath) continue;
		if (node.type === "File") continue;

		const symbolPath = node.id.substring(filePath.length + 1);
		if (symbolPath) {
			const parts = symbolPath.split(".");
			const lastName = parts[parts.length - 1];
			if (lastName) {
				map.set(lastName, node.id);
			}
		}
	}
};

/**
 * Add imported symbols to the map by parsing import declarations.
 */
const addImportedSymbols = (
	map: SymbolMap,
	nodes: Node[],
	filePath: string,
	sourceFile: SourceFile,
	options?: BuildSymbolMapOptions,
): void => {
	const imports = sourceFile.getImportDeclarations();
	const includeTypeImports = options?.includeTypeImports ?? false;

	for (const importDecl of imports) {
		const moduleSpecifier = importDecl.getModuleSpecifierValue();

		// Skip external modules (don't start with . or /)
		if (!moduleSpecifier.startsWith(".") && !moduleSpecifier.startsWith("/")) {
			continue;
		}

		// Skip type-only imports unless includeTypeImports is true
		if (importDecl.isTypeOnly() && !includeTypeImports) {
			continue;
		}

		// Resolve the target file path
		const targetPath = resolveImportPath(filePath, moduleSpecifier);

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

			// Find the node for this symbol in the target file
			const nodeId = findNodeByName(nodes, targetPath, originalName);
			if (nodeId) {
				map.set(localName, nodeId);
			}
		}

		// Process default imports: import utils from './utils'
		const defaultImport = importDecl.getDefaultImport();
		if (defaultImport) {
			const localName = defaultImport.getText();
			// Default exports typically have 'default' as the export name
			// or the file exports a single value
			const nodeId = findDefaultExport(nodes, targetPath);
			if (nodeId) {
				map.set(localName, nodeId);
			}
		}

		// Note: Namespace imports (import * as utils from './utils') are not
		// directly added since they're accessed as utils.foo() which requires
		// different resolution logic in extractCallsFromCallable
	}
};

/**
 * Find a node by name in a specific file.
 */
const findNodeByName = (
	nodes: Node[],
	filePath: string,
	symbolName: string,
): string | undefined => {
	for (const node of nodes) {
		if (node.filePath !== filePath) continue;
		if (node.type === "File") continue;
		if (!node.exported) continue;

		// Check if this node's name matches
		if (node.name === symbolName) {
			return node.id;
		}
	}
	return undefined;
};

/**
 * Find the default export from a file.
 * This is a simplified heuristic - looks for a single exported symbol.
 */
const findDefaultExport = (
	nodes: Node[],
	filePath: string,
): string | undefined => {
	// For now, we don't have explicit default export tracking
	// This could be enhanced if needed
	const exportedNodes = nodes.filter(
		(n) => n.filePath === filePath && n.exported && n.type !== "File",
	);

	// If there's exactly one exported symbol, assume it's the default
	if (exportedNodes.length === 1 && exportedNodes[0]) {
		return exportedNodes[0].id;
	}

	return undefined;
};

/**
 * Resolve import path relative to current file.
 * Copied from extractImportEdges.ts to avoid circular dependency.
 */
const resolveImportPath = (
	currentFilePath: string,
	importPath: string,
): string => {
	let cleanImportPath = importPath.replace(
		/\.(js|ts|tsx|jsx|mjs|mts|cjs|cts)$/,
		"",
	);

	if (importPath.startsWith(".")) {
		const lastSlash = currentFilePath.lastIndexOf("/");
		const currentDir =
			lastSlash >= 0 ? currentFilePath.substring(0, lastSlash) : "";
		const parts = currentDir ? currentDir.split("/") : [];

		const importParts = cleanImportPath.split("/");
		for (const part of importParts) {
			if (part === "..") {
				parts.pop();
			} else if (part === ".") {
				// skip
			} else if (part) {
				parts.push(part);
			}
		}

		cleanImportPath =
			parts.length > 0
				? parts.join("/")
				: importParts[importParts.length - 1] || "";
	}

	return `${cleanImportPath}.ts`;
};
