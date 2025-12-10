import {
	type ArrowFunction,
	type CallExpression,
	type FunctionDeclaration,
	type MethodDeclaration,
	type SourceFile,
	SyntaxKind,
	Node as TsMorphNode,
} from "ts-morph";
import type { Edge, Node } from "../db/Types.js";
import { generateNodeId } from "./IdGenerator.js";

export interface EdgeExtractionContext {
	filePath: string;
	module: string;
	package: string;
}

/**
 * Extract all edges from a source file (given already-extracted nodes).
 */
export const extractEdges = (
	sourceFile: SourceFile,
	nodes: Node[],
	context: EdgeExtractionContext,
): Edge[] => {
	const edges: Edge[] = [];

	edges.push(...extractContainsEdges(sourceFile, nodes, context));
	edges.push(...extractImportEdges(sourceFile, context));
	edges.push(...extractCallEdges(sourceFile, nodes, context));
	edges.push(...extractInheritanceEdges(sourceFile, context));
	edges.push(...extractTypeUsageEdges(sourceFile, context));

	return edges;
};

/**
 * Extract CONTAINS edges from file to its top-level declarations.
 */
export const extractContainsEdges = (
	_sourceFile: SourceFile,
	nodes: Node[],
	context: EdgeExtractionContext,
): Edge[] => {
	const edges: Edge[] = [];
	const fileId = generateNodeId(context.filePath);

	// Find all top-level nodes (not File node)
	const containedNodes = nodes.filter(
		(node) => node.filePath === context.filePath && node.id !== fileId,
	);

	for (const node of containedNodes) {
		// Only create CONTAINS edge for top-level symbols (no dots in symbol path after file path)
		const symbolPath = node.id.substring(context.filePath.length + 1); // +1 for ':'
		if (symbolPath && !symbolPath.includes(".")) {
			edges.push({
				source: fileId,
				target: node.id,
				type: "CONTAINS",
			});
		}
	}

	return edges;
};

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
 * Extract CALLS edges between functions and methods.
 */
export const extractCallEdges = (
	sourceFile: SourceFile,
	nodes: Node[],
	context: EdgeExtractionContext,
): Edge[] => {
	const edges: Edge[] = [];

	// Build a map of function/method names to their node IDs
	const symbolMap = buildSymbolMap(nodes, context.filePath);

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
 * Extract IMPLEMENTS and EXTENDS edges.
 */
export const extractInheritanceEdges = (
	sourceFile: SourceFile,
	context: EdgeExtractionContext,
): Edge[] => {
	const edges: Edge[] = [];

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
			const targetId = generateNodeId(context.filePath, parentName);
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
			const targetId = generateNodeId(context.filePath, interfaceName);
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
			const targetId = generateNodeId(context.filePath, parentName);
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
 * Extract USES_TYPE edges for type references.
 */
export const extractTypeUsageEdges = (
	sourceFile: SourceFile,
	context: EdgeExtractionContext,
): Edge[] => {
	const edges: Edge[] = [];

	// Extract type usage from functions
	extractTypeUsageFromFunctions(sourceFile, context, edges);

	// Extract type usage from variables
	extractTypeUsageFromVariables(sourceFile, context, edges);

	// Extract type usage from class properties
	extractTypeUsageFromProperties(sourceFile, context, edges);

	return edges;
};

// Helper functions

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

/**
 * Build a map of symbol names to node IDs for call resolution.
 */
const buildSymbolMap = (
	nodes: Node[],
	filePath: string,
): Map<string, string> => {
	const map = new Map<string, string>();

	for (const node of nodes) {
		if (node.filePath !== filePath) continue;
		if (node.type === "File") continue;

		// Extract symbol name from node ID
		const symbolPath = node.id.substring(filePath.length + 1); // +1 for ':'
		if (symbolPath) {
			const parts = symbolPath.split(".");
			const lastName = parts[parts.length - 1];
			if (lastName) {
				map.set(lastName, node.id);
			}
		}
	}

	return map;
};

/**
 * Extract call expressions from a callable (function, arrow function, or method).
 */
const extractCallsFromCallable = (
	callable: FunctionDeclaration | ArrowFunction | MethodDeclaration,
	callerId: string,
	symbolMap: Map<string, string>,
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

	// Count calls to each target
	const callCounts = new Map<string, number>();

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

			if (calleeName && symbolMap.has(calleeName)) {
				const targetId = symbolMap.get(calleeName);
				if (targetId) {
					callCounts.set(targetId, (callCounts.get(targetId) || 0) + 1);
				}
			}
		}
	}

	// Create edges with call counts
	for (const [targetId, count] of callCounts) {
		edges.push({
			source: callerId,
			target: targetId,
			type: "CALLS",
			callCount: count,
		});
	}
};

/**
 * Extract type usage from function parameters and return types.
 */
const extractTypeUsageFromFunctions = (
	sourceFile: SourceFile,
	context: EdgeExtractionContext,
	edges: Edge[],
): void => {
	const functions = sourceFile.getFunctions();
	const variables = sourceFile.getVariableDeclarations();

	// Regular functions
	for (const func of functions) {
		const funcName = func.getName();
		if (!funcName) continue;

		const sourceId = generateNodeId(context.filePath, funcName);
		extractTypeUsageFromCallable(func, sourceId, context, edges);
	}

	// Arrow functions
	for (const variable of variables) {
		const varName = variable.getName();
		const initializer = variable.getInitializer();

		if (initializer && TsMorphNode.isArrowFunction(initializer)) {
			const sourceId = generateNodeId(context.filePath, varName);
			extractTypeUsageFromCallable(initializer, sourceId, context, edges);
		}
	}

	// Methods
	const classes = sourceFile.getClasses();
	for (const classDecl of classes) {
		const className = classDecl.getName();
		if (!className) continue;

		const methods = classDecl.getMethods();
		for (const method of methods) {
			const methodName = method.getName();
			const sourceId = generateNodeId(context.filePath, className, methodName);
			extractTypeUsageFromCallable(method, sourceId, context, edges);
		}
	}
};

/**
 * Extract type usage from a callable's parameters and return type.
 */
const extractTypeUsageFromCallable = (
	callable: FunctionDeclaration | ArrowFunction | MethodDeclaration,
	sourceId: string,
	context: EdgeExtractionContext,
	edges: Edge[],
): void => {
	// Parameter types
	const parameters = callable.getParameters();
	for (const param of parameters) {
		const typeNode = param.getTypeNode();
		if (typeNode) {
			const typeName = extractSimpleTypeName(typeNode.getText());
			if (typeName && isLocalType(typeName)) {
				const targetId = generateNodeId(context.filePath, typeName);
				edges.push({
					source: sourceId,
					target: targetId,
					type: "USES_TYPE",
					context: "parameter",
				});
			}
		}
	}

	// Return type
	const returnTypeNode = callable.getReturnTypeNode();
	if (returnTypeNode) {
		const typeName = extractSimpleTypeName(returnTypeNode.getText());
		if (typeName && isLocalType(typeName)) {
			const targetId = generateNodeId(context.filePath, typeName);
			edges.push({
				source: sourceId,
				target: targetId,
				type: "USES_TYPE",
				context: "return",
			});
		}
	}
};

/**
 * Extract type usage from variable declarations.
 */
const extractTypeUsageFromVariables = (
	sourceFile: SourceFile,
	context: EdgeExtractionContext,
	edges: Edge[],
): void => {
	const variables = sourceFile.getVariableDeclarations();

	for (const variable of variables) {
		const varName = variable.getName();
		const typeNode = variable.getTypeNode();

		if (typeNode) {
			const typeName = extractSimpleTypeName(typeNode.getText());
			if (typeName && isLocalType(typeName)) {
				const sourceId = generateNodeId(context.filePath, varName);
				const targetId = generateNodeId(context.filePath, typeName);
				edges.push({
					source: sourceId,
					target: targetId,
					type: "USES_TYPE",
					context: "variable",
				});
			}
		}
	}
};

/**
 * Extract type usage from class properties.
 */
const extractTypeUsageFromProperties = (
	sourceFile: SourceFile,
	context: EdgeExtractionContext,
	edges: Edge[],
): void => {
	const classes = sourceFile.getClasses();

	for (const classDecl of classes) {
		const className = classDecl.getName();
		if (!className) continue;

		const properties = classDecl.getProperties();
		for (const property of properties) {
			const propName = property.getName();
			const typeNode = property.getTypeNode();

			if (typeNode) {
				const typeName = extractSimpleTypeName(typeNode.getText());
				if (typeName && isLocalType(typeName)) {
					const sourceId = generateNodeId(
						context.filePath,
						className,
						propName,
					);
					const targetId = generateNodeId(context.filePath, typeName);
					edges.push({
						source: sourceId,
						target: targetId,
						type: "USES_TYPE",
						context: "property",
					});
				}
			}
		}
	}
};

/**
 * Extract simple type name from type text (removes generics, arrays, etc.).
 */
const extractSimpleTypeName = (typeText: string): string | null => {
	// Remove whitespace
	const trimmed = typeText.trim();

	// Extract base type (before < or [ or |)
	const match = /^([A-Z][a-zA-Z0-9_]*)/.exec(trimmed);
	if (!match) return null;
	return match[1] ?? null;
};

/**
 * Check if a type name is a local type (not a built-in).
 */
const isLocalType = (typeName: string): boolean => {
	const builtInTypes = new Set([
		"String",
		"Number",
		"Boolean",
		"Array",
		"Object",
		"Date",
		"RegExp",
		"Promise",
		"Map",
		"Set",
		"WeakMap",
		"WeakSet",
		"Error",
		"Function",
		"Symbol",
		"BigInt",
	]);

	return !builtInTypes.has(typeName);
};
