import { type ClassDeclaration, SyntaxKind } from "ts-morph";
import type { MethodNode } from "../../../db/Types.js";
import { generateNodeId } from "../../generateNodeId.js";
import type { NodeExtractionContext } from "./NodeExtractionContext.js";
import { normalizeTypeText } from "./normalizeTypeText.js";

/**
 * Extract method nodes from a class.
 */
export const extractMethodNodes = (
	classNode: ClassDeclaration,
	context: NodeExtractionContext,
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
			type: normalizeTypeText(param.getTypeNode()?.getText()),
		}));

		// Extract return type
		const returnTypeNode = method.getReturnTypeNode();
		const returnType = normalizeTypeText(returnTypeNode?.getText());

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
