import type { SourceFile } from "ts-morph";
import type { Edge } from "../../../db/Types.js";
import { generateNodeId } from "../../IdGenerator.js";
import { buildImportMap } from "./buildImportMap.js";
import type { EdgeExtractionContext } from "./EdgeExtractionContext.js";

/**
 * A map from symbol names to their node IDs.
 * Combines local symbols and imported symbols.
 */
type SymbolMap = Map<string, string>;

/**
 * Extract IMPLEMENTS and EXTENDS edges.
 *
 * Uses buildImportMap for cross-file resolution:
 * - Local symbols: Resolved to current file
 * - Imported symbols: Resolved via ts-morph + import map
 */
export const extractInheritanceEdges = (
	sourceFile: SourceFile,
	context: EdgeExtractionContext,
): Edge[] => {
	const edges: Edge[] = [];

	// Build combined symbol map from local definitions + imports
	const symbolMap = buildCombinedSymbolMap(sourceFile, context.filePath);

	// Process classes
	const classes = sourceFile.getClasses();
	for (const classDecl of classes) {
		const className = classDecl.getName();
		if (!className) continue;

		const sourceId = generateNodeId(context.filePath, className);

		// EXTENDS edges (class to class)
		const extendsExpr = classDecl.getExtends();
		if (extendsExpr) {
			const parentName = extendsExpr.getExpression().getText();
			const targetId = resolveSymbol(symbolMap, context.filePath, parentName);
			edges.push({
				source: sourceId,
				target: targetId,
				type: "EXTENDS",
			});
		}

		// IMPLEMENTS edges (class to interface)
		const implementsExprs = classDecl.getImplements();
		for (const implementsExpr of implementsExprs) {
			const interfaceName = implementsExpr.getExpression().getText();
			const targetId = resolveSymbol(
				symbolMap,
				context.filePath,
				interfaceName,
			);
			edges.push({
				source: sourceId,
				target: targetId,
				type: "IMPLEMENTS",
			});
		}
	}

	// Process interfaces
	const interfaces = sourceFile.getInterfaces();
	for (const interfaceDecl of interfaces) {
		const interfaceName = interfaceDecl.getName();
		const sourceId = generateNodeId(context.filePath, interfaceName);

		// EXTENDS edges (interface to interface)
		const extendsExprs = interfaceDecl.getExtends();
		for (const extendsExpr of extendsExprs) {
			const parentName = extendsExpr.getExpression().getText();
			const targetId = resolveSymbol(symbolMap, context.filePath, parentName);
			edges.push({
				source: sourceId,
				target: targetId,
				type: "EXTENDS",
			});
		}
	}

	return edges;
};

/**
 * Build a combined symbol map from local definitions and imports.
 */
const buildCombinedSymbolMap = (
	sourceFile: SourceFile,
	filePath: string,
): SymbolMap => {
	const map: SymbolMap = new Map();

	// 1. Add local symbols (defined in this file)
	addLocalSymbols(map, sourceFile, filePath);

	// 2. Add imported symbols (from import declarations)
	// MUST include type-only imports since EXTENDS/IMPLEMENTS reference types
	const importMap = buildImportMap(sourceFile, filePath, {
		includeTypeImports: true,
	});
	for (const [name, targetId] of importMap) {
		map.set(name, targetId);
	}

	return map;
};

/**
 * Add symbols defined in the current file to the map.
 * Only adds classes and interfaces (the types that can be extended/implemented).
 */
const addLocalSymbols = (
	map: SymbolMap,
	sourceFile: SourceFile,
	filePath: string,
): void => {
	// Classes
	for (const classDecl of sourceFile.getClasses()) {
		const className = classDecl.getName();
		if (className) {
			map.set(className, `${filePath}:${className}`);
		}
	}

	// Interfaces
	for (const iface of sourceFile.getInterfaces()) {
		const name = iface.getName();
		map.set(name, `${filePath}:${name}`);
	}
};

/**
 * Resolve a symbol name to its node ID.
 * Uses the symbol map if available, otherwise falls back to same-file resolution.
 */
const resolveSymbol = (
	symbolMap: SymbolMap,
	filePath: string,
	symbolName: string,
): string => {
	return symbolMap.get(symbolName) ?? generateNodeId(filePath, symbolName);
};
