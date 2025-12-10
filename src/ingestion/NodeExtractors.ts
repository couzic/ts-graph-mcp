import {
	type ClassDeclaration,
	type InterfaceDeclaration,
	type SourceFile,
	SyntaxKind,
	VariableDeclarationKind,
} from "ts-morph";
import type {
	ClassNode,
	FileNode,
	FunctionNode,
	InterfaceNode,
	MethodNode,
	Node,
	PropertyNode,
	TypeAliasNode,
	VariableNode,
} from "../db/Types.js";
import { generateNodeId } from "./IdGenerator.js";

export interface ExtractionContext {
	filePath: string; // Relative file path
	module: string; // Module name
	package: string; // Package name
}

/**
 * Extract all nodes from a source file.
 */
export const extractNodes = (
	sourceFile: SourceFile,
	context: ExtractionContext,
): Node[] => {
	const nodes: Node[] = [];

	// Always extract file node
	nodes.push(extractFileNode(sourceFile, context));

	// Extract top-level functions
	nodes.push(...extractFunctionNodes(sourceFile, context));

	// Extract classes and their members
	const classes = extractClassNodes(sourceFile, context);
	for (const classNode of classes) {
		nodes.push(classNode);

		// Extract class members
		const classDecl = sourceFile
			.getClasses()
			.find((c) => c.getName() === classNode.name);
		if (classDecl) {
			nodes.push(...extractMethodNodes(classDecl, context));
			nodes.push(...extractPropertyNodes(classDecl, context));
		}
	}

	// Extract interfaces and their properties
	const interfaces = extractInterfaceNodes(sourceFile, context);
	for (const interfaceNode of interfaces) {
		nodes.push(interfaceNode);

		// Extract interface properties
		const interfaceDecl = sourceFile
			.getInterfaces()
			.find((i) => i.getName() === interfaceNode.name);
		if (interfaceDecl) {
			nodes.push(...extractPropertyNodes(interfaceDecl, context));
		}
	}

	// Extract type aliases
	nodes.push(...extractTypeAliasNodes(sourceFile, context));

	// Extract variables
	nodes.push(...extractVariableNodes(sourceFile, context));

	return nodes;
};

/**
 * Extract file node from a source file.
 */
export const extractFileNode = (
	sourceFile: SourceFile,
	context: ExtractionContext,
): FileNode => {
	const fileName = sourceFile.getBaseName();
	const extension = sourceFile.getExtension();
	const startLine = 1;
	const endLine = sourceFile.getEndLineNumber();

	return {
		id: generateNodeId(context.filePath),
		type: "File",
		name: fileName,
		module: context.module,
		package: context.package,
		filePath: context.filePath,
		startLine,
		endLine,
		exported: false,
		extension,
	};
};

/**
 * Extract function nodes from a source file.
 */
export const extractFunctionNodes = (
	sourceFile: SourceFile,
	context: ExtractionContext,
): FunctionNode[] => {
	const functions = sourceFile.getFunctions();
	return functions.map((func) => {
		const name = func.getName() || "<anonymous>";
		const startLine = func.getStartLineNumber();
		const endLine = func.getEndLineNumber();
		const exported = func.isExported();
		const isAsync = func.isAsync();

		// Extract parameters
		const parameters = func.getParameters().map((param) => ({
			name: param.getName(),
			type: param.getTypeNode()?.getText(),
		}));

		// Extract return type
		const returnTypeNode = func.getReturnTypeNode();
		const returnType = returnTypeNode?.getText();

		return {
			id: generateNodeId(context.filePath, name),
			type: "Function",
			name,
			module: context.module,
			package: context.package,
			filePath: context.filePath,
			startLine,
			endLine,
			exported,
			parameters,
			returnType,
			async: isAsync,
		};
	});
};

/**
 * Extract class nodes from a source file.
 */
export const extractClassNodes = (
	sourceFile: SourceFile,
	context: ExtractionContext,
): ClassNode[] => {
	const classes = sourceFile.getClasses();
	return classes.map((classDecl) => {
		const name = classDecl.getName() || "<anonymous>";
		const startLine = classDecl.getStartLineNumber();
		const endLine = classDecl.getEndLineNumber();
		const exported = classDecl.isExported();

		// Extract extends clause
		const extendsClause = classDecl.getExtends();
		const extendsName = extendsClause?.getText();

		// Extract implements clauses
		const implementsClauses = classDecl.getImplements();
		const implementsNames =
			implementsClauses.length > 0
				? implementsClauses.map((impl) => impl.getText())
				: undefined;

		return {
			id: generateNodeId(context.filePath, name),
			type: "Class",
			name,
			module: context.module,
			package: context.package,
			filePath: context.filePath,
			startLine,
			endLine,
			exported,
			extends: extendsName,
			implements: implementsNames,
		};
	});
};

/**
 * Extract method nodes from a class.
 */
export const extractMethodNodes = (
	classNode: ClassDeclaration,
	context: ExtractionContext,
): MethodNode[] => {
	const className = classNode.getName() || "<anonymous>";
	const methods = classNode.getMethods();

	return methods.map((method) => {
		const name = method.getName();
		const startLine = method.getStartLineNumber();
		const endLine = method.getEndLineNumber();
		const isAsync = method.isAsync();
		const isStatic = method.isStatic();

		// Extract visibility
		let visibility: "public" | "private" | "protected" = "public";
		if (method.hasModifier(SyntaxKind.PrivateKeyword)) {
			visibility = "private";
		} else if (method.hasModifier(SyntaxKind.ProtectedKeyword)) {
			visibility = "protected";
		}

		// Extract parameters
		const parameters = method.getParameters().map((param) => ({
			name: param.getName(),
			type: param.getTypeNode()?.getText(),
		}));

		// Extract return type
		const returnTypeNode = method.getReturnTypeNode();
		const returnType = returnTypeNode?.getText();

		return {
			id: generateNodeId(context.filePath, className, name),
			type: "Method",
			name,
			module: context.module,
			package: context.package,
			filePath: context.filePath,
			startLine,
			endLine,
			exported: false, // Methods are not directly exported
			parameters,
			returnType,
			async: isAsync,
			visibility,
			static: isStatic,
		};
	});
};

/**
 * Extract interface nodes from a source file.
 */
export const extractInterfaceNodes = (
	sourceFile: SourceFile,
	context: ExtractionContext,
): InterfaceNode[] => {
	const interfaces = sourceFile.getInterfaces();
	return interfaces.map((interfaceDecl) => {
		const name = interfaceDecl.getName();
		const startLine = interfaceDecl.getStartLineNumber();
		const endLine = interfaceDecl.getEndLineNumber();
		const exported = interfaceDecl.isExported();

		// Extract extends clauses
		const extendsClauses = interfaceDecl.getExtends();
		const extendsNames =
			extendsClauses.length > 0
				? extendsClauses.map((ext) => ext.getText())
				: undefined;

		return {
			id: generateNodeId(context.filePath, name),
			type: "Interface",
			name,
			module: context.module,
			package: context.package,
			filePath: context.filePath,
			startLine,
			endLine,
			exported,
			extends: extendsNames,
		};
	});
};

/**
 * Extract type alias nodes from a source file.
 */
export const extractTypeAliasNodes = (
	sourceFile: SourceFile,
	context: ExtractionContext,
): TypeAliasNode[] => {
	const typeAliases = sourceFile.getTypeAliases();
	return typeAliases.map((typeAlias) => {
		const name = typeAlias.getName();
		const startLine = typeAlias.getStartLineNumber();
		const endLine = typeAlias.getEndLineNumber();
		const exported = typeAlias.isExported();

		// Extract aliased type
		const typeNode = typeAlias.getTypeNode();
		const aliasedType = typeNode?.getText();

		return {
			id: generateNodeId(context.filePath, name),
			type: "TypeAlias",
			name,
			module: context.module,
			package: context.package,
			filePath: context.filePath,
			startLine,
			endLine,
			exported,
			aliasedType,
		};
	});
};

/**
 * Extract variable nodes from a source file.
 */
export const extractVariableNodes = (
	sourceFile: SourceFile,
	context: ExtractionContext,
): VariableNode[] => {
	const variableStatements = sourceFile.getVariableStatements();
	const variables: VariableNode[] = [];

	for (const statement of variableStatements) {
		const declarations = statement.getDeclarations();
		const declarationKind = statement.getDeclarationKind();
		// Compare against VariableDeclarationKind.Const enum value
		const isConst = declarationKind === VariableDeclarationKind.Const;

		for (const decl of declarations) {
			const name = decl.getName();
			const startLine = decl.getStartLineNumber();
			const endLine = decl.getEndLineNumber();
			const exported = statement.isExported();

			// Extract type annotation
			const typeNode = decl.getTypeNode();
			const variableType = typeNode?.getText();

			variables.push({
				id: generateNodeId(context.filePath, name),
				type: "Variable",
				name,
				module: context.module,
				package: context.package,
				filePath: context.filePath,
				startLine,
				endLine,
				exported,
				variableType,
				isConst,
			});
		}
	}

	return variables;
};

/**
 * Extract property nodes from a class or interface.
 */
export const extractPropertyNodes = (
	parent: ClassDeclaration | InterfaceDeclaration,
	context: ExtractionContext,
): PropertyNode[] => {
	const parentName = parent.getName() || "<anonymous>";
	const properties = parent.getProperties();

	return properties.map((prop) => {
		const name = prop.getName();
		const startLine = prop.getStartLineNumber();
		const endLine = prop.getEndLineNumber();
		const isOptional = prop.hasQuestionToken();
		const isReadonly = prop.isReadonly();

		// Extract property type
		const typeNode = prop.getTypeNode();
		const propertyType = typeNode?.getText();

		return {
			id: generateNodeId(context.filePath, parentName, name),
			type: "Property",
			name,
			module: context.module,
			package: context.package,
			filePath: context.filePath,
			startLine,
			endLine,
			exported: false, // Properties are not directly exported
			propertyType,
			optional: isOptional,
			readonly: isReadonly,
		};
	});
};
