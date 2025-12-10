import type {
	Edge,
	EdgeType,
	MermaidOptions,
	Node,
	Subgraph,
} from "./Types.js";

const EDGE_LABELS: Record<EdgeType, string> = {
	CALLS: "calls",
	IMPORTS: "imports",
	CONTAINS: "contains",
	IMPLEMENTS: "implements",
	EXTENDS: "extends",
	USES_TYPE: "uses type",
	READS_PROPERTY: "reads",
	WRITES_PROPERTY: "writes",
};

const formatNodeLabel = (node: Node): string => {
	if (node.type === "Function" || node.type === "Method") {
		return `${node.name}()`;
	}
	return node.name;
};

const formatEdgeLabel = (edge: Edge): string => {
	return EDGE_LABELS[edge.type];
};

/**
 * Convert a Subgraph to Mermaid flowchart syntax.
 *
 * Output format:
 * - Functions/Methods: myFunction()
 * - Other nodes: just the name (User, Order, etc.)
 * - Edge labels: lowercase, human readable (calls, imports, uses type)
 *
 * @param subgraph - The subgraph to convert
 * @param options - Mermaid rendering options
 * @returns Mermaid flowchart string
 */
export const subgraphToMermaid = (
	subgraph: Subgraph,
	options?: MermaidOptions,
): string => {
	const direction = options?.direction ?? "LR";
	const lines: string[] = [`graph ${direction}`];

	// Build node ID mapping (node.id -> n0, n1, etc.)
	const nodeIdMap = new Map<string, string>();
	subgraph.nodes.forEach((node, index) => {
		nodeIdMap.set(node.id, `n${index}`);
	});

	// Output node definitions
	for (const node of subgraph.nodes) {
		const mermaidId = nodeIdMap.get(node.id);
		const label = formatNodeLabel(node);
		lines.push(`  ${mermaidId}["${label}"]`);
	}

	// Output edge definitions
	for (const edge of subgraph.edges) {
		const sourceId = nodeIdMap.get(edge.source);
		const targetId = nodeIdMap.get(edge.target);
		if (sourceId !== undefined && targetId !== undefined) {
			const label = formatEdgeLabel(edge);
			lines.push(`  ${sourceId} -->|${label}| ${targetId}`);
		}
	}

	return lines.join("\n");
};
