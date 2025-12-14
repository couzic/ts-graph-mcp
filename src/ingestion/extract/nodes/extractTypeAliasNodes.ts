import type { SourceFile } from "ts-morph";
import type { TypeAliasNode } from "../../../db/Types.js";
import { generateNodeId } from "../../IdGenerator.js";
import type { NodeExtractionContext } from "./NodeExtractionContext.js";
import { normalizeTypeText } from "./normalizeTypeText.js";

/**
 * Extract type alias nodes from a source file.
 */
export const extractTypeAliasNodes = (
	sourceFile: SourceFile,
	context: NodeExtractionContext,
): TypeAliasNode[] => {
	const typeAliases = sourceFile.getTypeAliases();
	return typeAliases.map((typeAlias) => {
		const name = typeAlias.getName();
		const startLine = typeAlias.getStartLineNumber();
		const endLine = typeAlias.getEndLineNumber();
		const exported = typeAlias.isExported();

		// Extract aliased type
		const typeNode = typeAlias.getTypeNode();
		const aliasedType = normalizeTypeText(typeNode?.getText());

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
