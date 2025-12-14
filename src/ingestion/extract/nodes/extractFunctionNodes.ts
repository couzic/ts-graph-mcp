import type { SourceFile } from "ts-morph";
import type { FunctionNode } from "../../../db/Types.js";
import { generateNodeId } from "../../IdGenerator.js";
import { normalizeTypeText } from "../../normalizeTypeText.js";
import type { NodeExtractionContext } from "./NodeExtractionContext.js";

/**
 * Extract function nodes from a source file.
 */
export const extractFunctionNodes = (
	sourceFile: SourceFile,
	context: NodeExtractionContext,
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
			type: normalizeTypeText(param.getTypeNode()?.getText()),
		}));

		// Extract return type
		const returnTypeNode = func.getReturnTypeNode();
		const returnType = normalizeTypeText(returnTypeNode?.getText());

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
