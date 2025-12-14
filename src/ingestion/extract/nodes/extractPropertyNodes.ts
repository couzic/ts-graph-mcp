import type { ClassDeclaration, InterfaceDeclaration } from "ts-morph";
import type { PropertyNode } from "../../../db/Types.js";
import { generateNodeId } from "../../IdGenerator.js";
import type { NodeExtractionContext } from "./NodeExtractionContext.js";
import { normalizeTypeText } from "./normalizeTypeText.js";

/**
 * Extract property nodes from a class or interface.
 */
export const extractPropertyNodes = (
	parent: ClassDeclaration | InterfaceDeclaration,
	context: NodeExtractionContext,
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
		const propertyType = normalizeTypeText(typeNode?.getText());

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
