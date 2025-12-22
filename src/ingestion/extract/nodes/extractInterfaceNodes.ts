import type { SourceFile } from "ts-morph";
import type { InterfaceNode } from "../../../db/Types.js";
import { generateNodeId } from "../../generateNodeId.js";
import type { NodeExtractionContext } from "./NodeExtractionContext.js";
import { normalizeTypeText } from "./normalizeTypeText.js";

/**
 * Extract interface nodes from a source file.
 */
export const extractInterfaceNodes = (
	sourceFile: SourceFile,
	context: NodeExtractionContext,
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
				? extendsClauses.map(
						(ext) => normalizeTypeText(ext.getText()) as string,
					)
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
