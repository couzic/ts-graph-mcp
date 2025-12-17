import type { SourceFile } from "ts-morph";
import type { Edge } from "../../../db/Types.js";
import { generateNodeId } from "../../IdGenerator.js";
import type { EdgeExtractionContext } from "./EdgeExtractionContext.js";

/**
 * Extract CONTAINS edges from file to its top-level declarations.
 *
 * Extracts directly from AST without needing a nodes array.
 * Top-level symbols: functions, classes, interfaces, type aliases, variables.
 */
export const extractContainsEdges = (
	sourceFile: SourceFile,
	context: EdgeExtractionContext,
): Edge[] => {
	const edges: Edge[] = [];
	const fileId = generateNodeId(context.filePath);

	// Extract top-level symbol names directly from AST
	const topLevelSymbols = extractTopLevelSymbolNames(sourceFile);

	for (const symbolName of topLevelSymbols) {
		const targetId = generateNodeId(context.filePath, symbolName);
		edges.push({
			source: fileId,
			target: targetId,
			type: "CONTAINS",
		});
	}

	return edges;
};

/**
 * Extract names of top-level symbols from a source file.
 * Top-level symbols are directly declared in the file (not nested).
 */
const extractTopLevelSymbolNames = (sourceFile: SourceFile): string[] => {
	const names: string[] = [];

	// Named functions
	for (const func of sourceFile.getFunctions()) {
		const name = func.getName();
		if (name) names.push(name);
	}

	// Named classes
	for (const classDecl of sourceFile.getClasses()) {
		const name = classDecl.getName();
		if (name) names.push(name);
	}

	// Interfaces
	for (const iface of sourceFile.getInterfaces()) {
		names.push(iface.getName());
	}

	// Type aliases
	for (const typeAlias of sourceFile.getTypeAliases()) {
		names.push(typeAlias.getName());
	}

	// Variables (arrow functions, constants, etc.)
	for (const variable of sourceFile.getVariableDeclarations()) {
		names.push(variable.getName());
	}

	return names;
};
