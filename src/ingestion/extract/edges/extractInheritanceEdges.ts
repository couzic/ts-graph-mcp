import type { SourceFile } from "ts-morph";
import type { Edge } from "../../../db/Types.js";
import { generateNodeId } from "../../IdGenerator.js";
import type { EdgeExtractionContext } from "./EdgeExtractionContext.js";

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
