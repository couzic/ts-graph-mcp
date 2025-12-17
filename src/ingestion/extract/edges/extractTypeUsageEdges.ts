import {
	type ArrowFunction,
	type FunctionDeclaration,
	type MethodDeclaration,
	type SourceFile,
	Node as TsMorphNode,
} from "ts-morph";
import type { Edge } from "../../../db/Types.js";
import { generateNodeId } from "../../IdGenerator.js";
import { buildImportMap } from "./buildImportMap.js";
import type { EdgeExtractionContext } from "./EdgeExtractionContext.js";

/**
 * A map from type names to their node IDs.
 * Combines local types and imported types.
 */
type TypeMap = Map<string, string>;

/**
 * Extract USES_TYPE edges for type references.
 *
 * Uses a simplified approach that doesn't require a global nodes array:
 * - Local types: Extracted from the current file's AST
 * - Imported types: Resolved via ts-morph + import map (including type-only imports)
 *
 * @param sourceFile - The source file AST
 * @param context - Extraction context (filePath, module, package)
 */
export const extractTypeUsageEdges = (
	sourceFile: SourceFile,
	context: EdgeExtractionContext,
): Edge[] => {
	const edges: Edge[] = [];

	// Build combined type map from local definitions + imports (including type-only)
	const typeMap = buildCombinedTypeMap(sourceFile, context.filePath);

	// Extract type usage from functions
	extractTypeUsageFromFunctions(sourceFile, context, typeMap, edges);

	// Extract type usage from variables
	extractTypeUsageFromVariables(sourceFile, context, typeMap, edges);

	// Extract type usage from class properties
	extractTypeUsageFromProperties(sourceFile, context, typeMap, edges);

	return edges;
};

/**
 * Build a combined type map from local definitions and imports.
 * This is the simplified approach that doesn't need the global nodes array.
 */
const buildCombinedTypeMap = (
	sourceFile: SourceFile,
	filePath: string,
): TypeMap => {
	const map: TypeMap = new Map();

	// 1. Add local types (defined in this file)
	addLocalTypes(map, sourceFile, filePath);

	// 2. Add imported types (including type-only imports)
	const importMap = buildImportMap(sourceFile, filePath, {
		includeTypeImports: true,
	});
	for (const [name, targetId] of importMap) {
		map.set(name, targetId);
	}

	return map;
};

/**
 * Add type symbols defined in the current file to the map.
 * Constructs IDs directly as filePath:symbolName.
 */
const addLocalTypes = (
	map: TypeMap,
	sourceFile: SourceFile,
	filePath: string,
): void => {
	// Interfaces
	for (const iface of sourceFile.getInterfaces()) {
		const name = iface.getName();
		map.set(name, `${filePath}:${name}`);
	}

	// Type aliases
	for (const typeAlias of sourceFile.getTypeAliases()) {
		const name = typeAlias.getName();
		map.set(name, `${filePath}:${name}`);
	}

	// Classes (can be used as types)
	for (const classDecl of sourceFile.getClasses()) {
		const name = classDecl.getName();
		if (name) {
			map.set(name, `${filePath}:${name}`);
		}
	}
};

/**
 * Extract type usage from function parameters and return types.
 */
const extractTypeUsageFromFunctions = (
	sourceFile: SourceFile,
	context: EdgeExtractionContext,
	typeMap: TypeMap,
	edges: Edge[],
): void => {
	const functions = sourceFile.getFunctions();
	const variables = sourceFile.getVariableDeclarations();

	// Regular functions
	for (const func of functions) {
		const funcName = func.getName();
		if (!funcName) continue;

		const sourceId = generateNodeId(context.filePath, funcName);
		extractTypeUsageFromCallable(func, sourceId, typeMap, edges);
	}

	// Arrow functions
	for (const variable of variables) {
		const varName = variable.getName();
		const initializer = variable.getInitializer();

		if (initializer && TsMorphNode.isArrowFunction(initializer)) {
			const sourceId = generateNodeId(context.filePath, varName);
			extractTypeUsageFromCallable(initializer, sourceId, typeMap, edges);
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
			extractTypeUsageFromCallable(method, sourceId, typeMap, edges);
		}
	}
};

/**
 * Extract type usage from a callable's parameters and return type.
 */
const extractTypeUsageFromCallable = (
	callable: FunctionDeclaration | ArrowFunction | MethodDeclaration,
	sourceId: string,
	typeMap: TypeMap,
	edges: Edge[],
): void => {
	// Parameter types
	const parameters = callable.getParameters();
	for (const param of parameters) {
		const typeNode = param.getTypeNode();
		if (typeNode) {
			const typeName = extractSimpleTypeName(typeNode.getText());
			if (typeName && isLocalType(typeName)) {
				const targetId = typeMap.get(typeName);
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
			const targetId = typeMap.get(typeName);
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
	typeMap: TypeMap,
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
				const targetId = typeMap.get(typeName);
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
	typeMap: TypeMap,
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
					const targetId = typeMap.get(typeName);
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
