import type { SourceFile } from "ts-morph";
import type { Edge } from "../../../db/Types.js";
import { generateNodeId } from "../../IdGenerator.js";
import type { EdgeExtractionContext } from "./EdgeExtractionContext.js";

/**
 * Extract IMPORTS edges from this file to other files.
 */
export const extractImportEdges = (
	sourceFile: SourceFile,
	context: EdgeExtractionContext,
): Edge[] => {
	const edges: Edge[] = [];
	const sourceId = generateNodeId(context.filePath);

	const imports = sourceFile.getImportDeclarations();

	for (const importDecl of imports) {
		const moduleSpecifier = importDecl.getModuleSpecifierValue();

		// Skip external modules (don't start with . or /)
		if (!moduleSpecifier.startsWith(".") && !moduleSpecifier.startsWith("/")) {
			continue;
		}

		// Resolve relative path to target file
		const targetPath = resolveImportPath(context.filePath, moduleSpecifier);
		const targetId = generateNodeId(targetPath);

		// Collect imported symbols
		const importedSymbols: string[] = [];
		const namedImports = importDecl.getNamedImports();
		for (const namedImport of namedImports) {
			importedSymbols.push(namedImport.getName());
		}

		const defaultImport = importDecl.getDefaultImport();
		if (defaultImport) {
			importedSymbols.push(defaultImport.getText());
		}

		const namespaceImport = importDecl.getNamespaceImport();
		if (namespaceImport) {
			importedSymbols.push(namespaceImport.getText());
		}

		edges.push({
			source: sourceId,
			target: targetId,
			type: "IMPORTS",
			isTypeOnly: importDecl.isTypeOnly(),
			importedSymbols,
		});
	}

	return edges;
};

/**
 * Resolve import path relative to current file.
 */
const resolveImportPath = (
	currentFilePath: string,
	importPath: string,
): string => {
	// Remove file extension from import path if present
	let cleanImportPath = importPath.replace(
		/\.(js|ts|tsx|jsx|mjs|mts|cjs|cts)$/,
		"",
	);

	// Handle relative imports
	if (importPath.startsWith(".")) {
		const lastSlash = currentFilePath.lastIndexOf("/");
		const currentDir =
			lastSlash >= 0 ? currentFilePath.substring(0, lastSlash) : "";
		const parts = currentDir ? currentDir.split("/") : [];

		// Split import path and process .. and .
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

	// Add .ts extension
	return `${cleanImportPath}.ts`;
};
