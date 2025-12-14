import type { SourceFile } from "ts-morph";
import type { Edge, Node } from "../../../db/Types.js";
import { generateNodeId } from "../../IdGenerator.js";
import type { EdgeExtractionContext } from "./EdgeExtractionContext.js";

/**
 * Extract CONTAINS edges from file to its top-level declarations.
 */
export const extractContainsEdges = (
	_sourceFile: SourceFile,
	nodes: Node[],
	context: EdgeExtractionContext,
): Edge[] => {
	const edges: Edge[] = [];
	const fileId = generateNodeId(context.filePath);

	// Find all top-level nodes (not File node)
	const containedNodes = nodes.filter(
		(node) => node.filePath === context.filePath && node.id !== fileId,
	);

	for (const node of containedNodes) {
		// Only create CONTAINS edge for top-level symbols (no dots in symbol path after file path)
		const symbolPath = node.id.substring(context.filePath.length + 1); // +1 for ':'
		if (symbolPath && !symbolPath.includes(".")) {
			edges.push({
				source: fileId,
				target: node.id,
				type: "CONTAINS",
			});
		}
	}

	return edges;
};
