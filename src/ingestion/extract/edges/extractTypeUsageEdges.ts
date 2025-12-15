import {
	type ArrowFunction,
	type FunctionDeclaration,
	type MethodDeclaration,
	type SourceFile,
	Node as TsMorphNode,
} from "ts-morph";
import type { Edge, Node } from "../../../db/Types.js";
import { generateNodeId } from "../../IdGenerator.js";
import { buildSymbolMap, type SymbolMap } from "./buildSymbolMap.js";
import type { EdgeExtractionContext } from "./EdgeExtractionContext.js";

/**
 * Extract USES_TYPE edges for type references.
 *
 * @param sourceFile - The source file AST
 * @param nodes - All nodes from the codebase (enables cross-file resolution)
 * @param context - Extraction context (filePath, module, package)
 */
export const extractTypeUsageEdges = (
	sourceFile: SourceFile,
	nodes: Node[],
	context: EdgeExtractionContext,
): Edge[] => {
	const edges: Edge[] = [];

	// Build symbol map including type imports for cross-file resolution
	const typeSymbolMap = buildSymbolMap(nodes, context.filePath, sourceFile, {
		includeTypeImports: true,
	});

	// Extract type usage from functions
	extractTypeUsageFromFunctions(sourceFile, context, typeSymbolMap, edges);

	// Extract type usage from variables
	extractTypeUsageFromVariables(sourceFile, context, typeSymbolMap, edges);

	// Extract type usage from class properties
	extractTypeUsageFromProperties(sourceFile, context, typeSymbolMap, edges);

	return edges;
};

/**
 * Extract type usage from function parameters and return types.
 */
const extractTypeUsageFromFunctions = (
	sourceFile: SourceFile,
	context: EdgeExtractionContext,
	typeSymbolMap: SymbolMap,
	edges: Edge[],
): void => {
	const functions = sourceFile.getFunctions();
	const variables = sourceFile.getVariableDeclarations();

	// Regular functions
	for (const func of functions) {
		const funcName = func.getName();
		if (!funcName) continue;

		const sourceId = generateNodeId(context.filePath, funcName);
		extractTypeUsageFromCallable(func, sourceId, typeSymbolMap, edges);
	}

	// Arrow functions
	for (const variable of variables) {
		const varName = variable.getName();
		const initializer = variable.getInitializer();

		if (initializer && TsMorphNode.isArrowFunction(initializer)) {
			const sourceId = generateNodeId(context.filePath, varName);
			extractTypeUsageFromCallable(initializer, sourceId, typeSymbolMap, edges);
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
			extractTypeUsageFromCallable(method, sourceId, typeSymbolMap, edges);
		}
	}
};

/**
 * Extract type usage from a callable's parameters and return type.
 */
const extractTypeUsageFromCallable = (
	callable: FunctionDeclaration | ArrowFunction | MethodDeclaration,
	sourceId: string,
	typeSymbolMap: SymbolMap,
	edges: Edge[],
): void => {
	// Parameter types
	const parameters = callable.getParameters();
	for (const param of parameters) {
		const typeNode = param.getTypeNode();
		if (typeNode) {
			const typeName = extractSimpleTypeName(typeNode.getText());
			if (typeName && isLocalType(typeName)) {
				// Use symbol map to resolve cross-file types
				const targetId = typeSymbolMap.get(typeName);
				if (targetId) {
					edges.push({
						source: sourceId,
						target: targetId,
						type: "USES_TYPE",
						context: "parameter",
					});
				}
			}
		}
	}

	// Return type
	const returnTypeNode = callable.getReturnTypeNode();
	if (returnTypeNode) {
		const typeName = extractSimpleTypeName(returnTypeNode.getText());
		if (typeName && isLocalType(typeName)) {
			// Use symbol map to resolve cross-file types
			const targetId = typeSymbolMap.get(typeName);
			if (targetId) {
				edges.push({
					source: sourceId,
					target: targetId,
					type: "USES_TYPE",
					context: "return",
				});
			}
		}
	}
};

/**
 * Extract type usage from variable declarations.
 */
const extractTypeUsageFromVariables = (
	sourceFile: SourceFile,
	context: EdgeExtractionContext,
	typeSymbolMap: SymbolMap,
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
				// Use symbol map to resolve cross-file types
				const targetId = typeSymbolMap.get(typeName);
				if (targetId) {
					edges.push({
						source: sourceId,
						target: targetId,
						type: "USES_TYPE",
						context: "variable",
					});
				}
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
	typeSymbolMap: SymbolMap,
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
					// Use symbol map to resolve cross-file types
					const targetId = typeSymbolMap.get(typeName);
					if (targetId) {
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
