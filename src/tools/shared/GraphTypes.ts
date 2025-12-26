/**
 * An edge in the code graph.
 */
export interface GraphEdge {
	source: string; // Node ID (e.g., "src/utils.ts:formatDate")
	target: string; // Node ID
	type: string; // CALLS, REFERENCES, EXTENDS, IMPLEMENTS
}

/**
 * Node information for the Nodes section.
 */
export interface NodeInfo {
	id: string;
	name: string;
	filePath: string;
	startLine: number;
	endLine: number;
}
