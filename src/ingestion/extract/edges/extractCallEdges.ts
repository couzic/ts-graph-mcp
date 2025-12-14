import {
	type ArrowFunction,
	type CallExpression,
	type FunctionDeclaration,
	type MethodDeclaration,
	type SourceFile,
	SyntaxKind,
	Node as TsMorphNode,
} from "ts-morph";
import type { Edge, Node } from "../../../db/Types.js";
import { generateNodeId } from "../../IdGenerator.js";
import type { EdgeExtractionContext } from "./EdgeExtractionContext.js";

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
