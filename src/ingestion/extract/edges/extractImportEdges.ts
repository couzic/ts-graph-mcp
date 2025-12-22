import type { SourceFile } from "ts-morph";
import type { Edge } from "../../../db/Types.js";
import { generateNodeId } from "../../generateNodeId.js";
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

	// Derive the project root from the source file paths
	const sourceAbsolutePath = sourceFile.getFilePath().replace(/\\/g, "/");
	const projectRoot = deriveProjectRoot(sourceAbsolutePath, context.filePath);

	const imports = sourceFile.getImportDeclarations();

	for (const importDecl of imports) {
		const moduleSpecifier = importDecl.getModuleSpecifierValue();

		// Use ts-morph to resolve the import (handles path aliases like @shared/*)
		const resolvedSourceFile = importDecl.getModuleSpecifierSourceFile();

		let targetPath: string;

		if (resolvedSourceFile) {
			// ts-morph resolved the import - get the relative path
			const targetAbsolutePath = resolvedSourceFile
				.getFilePath()
				.replace(/\\/g, "/");
			targetPath = targetAbsolutePath.startsWith(projectRoot)
				? targetAbsolutePath.slice(projectRoot.length)
				: targetAbsolutePath;
		} else if (
			moduleSpecifier.startsWith(".") ||
			moduleSpecifier.startsWith("/")
		) {
			// Fallback for relative imports (for in-memory/test files)
			const resolved = resolveRelativeImport(context.filePath, moduleSpecifier);
			if (!resolved) {
				continue; // Couldn't resolve relative import
			}
			targetPath = resolved;
		} else {
			// External module - skip
			continue;
		}

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
 * Resolve a relative import path to a target file path.
 * Used as fallback for in-memory/test files when ts-morph can't resolve.
 *
 * @param sourceFilePath - The file containing the import
 * @param moduleSpecifier - The import path (e.g., './utils' or '../shared/types')
 * @returns The resolved target file path, or undefined if not found
 */
const resolveRelativeImport = (
	sourceFilePath: string,
	moduleSpecifier: string,
): string | undefined => {
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
	// .js → .ts, .jsx → .tsx
	if (basePath.endsWith(".js")) {
		return `${basePath.slice(0, -3)}.ts`;
	}
	if (basePath.endsWith(".jsx")) {
		return `${basePath.slice(0, -4)}.tsx`;
	}

	// For extensionless imports, add .ts: import './utils' → target is 'utils.ts'
	if (!basePath.match(/\.[jt]sx?$/)) {
		return `${basePath}.ts`;
	}

	return basePath;
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
