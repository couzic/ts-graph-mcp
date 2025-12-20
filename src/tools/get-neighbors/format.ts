import type { Edge, EdgeType, Node, NodeType } from "../../db/Types.js";
import { TYPE_ORDER, TYPE_PLURALS } from "../shared/formatConstants.js";
import {
	extractSymbol,
	formatLines,
	formatNode,
} from "../shared/nodeFormatters.js";
import type { Direction, NeighborResult } from "./query.js";

/**
 * Edge type labels for Mermaid diagrams.
 */
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

/**
 * Format center node data (type-specific properties).
 */
function formatCenterData(node: Node): string[] {
	const lines: string[] = [];
	const lineRange = formatLines(node.startLine, node.endLine);
	lines.push(`  line: ${lineRange}`);

	if (node.exported) lines.push("  exported: true");

	switch (node.type) {
		case "Function":
			if (node.async) lines.push("  async: true");
			if (node.parameters?.length) {
				const params = node.parameters
					.map((p) => `${p.name}:${p.type ?? "?"}`)
					.join(", ");
				lines.push(`  params: (${params})`);
			}
			if (node.returnType) lines.push(`  returns: ${node.returnType}`);
			break;

		case "Class":
			if (node.extends) lines.push(`  extends: ${node.extends}`);
			if (node.implements?.length)
				lines.push(`  implements: [${node.implements.join(", ")}]`);
			break;

		case "Method":
			if (node.visibility && node.visibility !== "public")
				lines.push(`  visibility: ${node.visibility}`);
			if (node.static) lines.push("  static: true");
			if (node.async) lines.push("  async: true");
			if (node.parameters?.length) {
				const params = node.parameters
					.map((p) => `${p.name}:${p.type ?? "?"}`)
					.join(", ");
				lines.push(`  params: (${params})`);
			}
			if (node.returnType) lines.push(`  returns: ${node.returnType}`);
			break;

		case "Interface":
			if (node.extends?.length)
				lines.push(`  extends: [${node.extends.join(", ")}]`);
			break;

		case "TypeAlias":
			if (node.aliasedType) lines.push(`  aliasedType: ${node.aliasedType}`);
			break;

		case "Variable":
			if (node.isConst) lines.push("  const: true");
			if (node.variableType) lines.push(`  type: ${node.variableType}`);
			break;

		case "Property":
			if (node.optional) lines.push("  optional: true");
			if (node.readonly) lines.push("  readonly: true");
			if (node.propertyType) lines.push(`  type: ${node.propertyType}`);
			break;

		case "File":
			if (node.extension) lines.push(`  extension: ${node.extension}`);
			break;
	}

	return lines;
}

/**
 * Format an edge with only relevant metadata.
 */
function formatEdge(edge: Edge): string {
	const sourceSymbol = extractSymbol(edge.source);
	const targetSymbol = extractSymbol(edge.target);

	// For CALLS edges, include call count if > 1
	if (edge.type === "CALLS" && edge.callCount && edge.callCount > 1) {
		return `${sourceSymbol} --CALLS(${edge.callCount})--> ${targetSymbol}`;
	}

	return `${sourceSymbol} --${edge.type}--> ${targetSymbol}`;
}

/**
 * Group nodes by file, then by type within each file.
 */
function groupByFileAndType(nodes: Node[]): Map<string, Map<NodeType, Node[]>> {
	const fileGroups = new Map<string, Map<NodeType, Node[]>>();

	for (const node of nodes) {
		let typeGroups = fileGroups.get(node.filePath);
		if (!typeGroups) {
			typeGroups = new Map<NodeType, Node[]>();
			fileGroups.set(node.filePath, typeGroups);
		}

		const existing = typeGroups.get(node.type) ?? [];
		existing.push(node);
		typeGroups.set(node.type, existing);
	}

	return fileGroups;
}

/**
 * Generate a Mermaid flowchart from the subgraph.
 */
function generateMermaid(nodes: Node[], edges: Edge[]): string {
	const lines: string[] = ["graph LR"];

	// Build node ID mapping (node.id -> n0, n1, etc.)
	const nodeIdMap = new Map<string, string>();
	nodes.forEach((node, index) => {
		nodeIdMap.set(node.id, `n${index}`);
	});

	// Output node definitions
	for (const node of nodes) {
		const mermaidId = nodeIdMap.get(node.id);
		const label =
			node.type === "Function" || node.type === "Method"
				? `${node.name}()`
				: node.name;
		lines.push(`  ${mermaidId}["${label}"]`);
	}

	// Output edge definitions
	for (const edge of edges) {
		const sourceId = nodeIdMap.get(edge.source);
		const targetId = nodeIdMap.get(edge.target);
		if (sourceId !== undefined && targetId !== undefined) {
			const label = EDGE_LABELS[edge.type];
			lines.push(`  ${sourceId} -->|${label}| ${targetId}`);
		}
	}

	return lines.join("\n");
}

/**
 * Format neighbor result for LLM consumption.
 *
 * Output format:
 * ```
 * center: src/db/Types.ts:Node
 * centerType: TypeAlias
 * centerData:
 *   line: 104-112
 *   exported: true
 *   aliasedType: | FunctionNode | ClassNode | ...
 * distance: 1
 * direction: both
 * nodeCount: 2
 * edgeCount: 1
 *
 * src/db/Types.ts (2 nodes):
 *   files[1]:
 *     Types.ts [1-233]
 *   typeAliases[1]:
 *     Node [104-112] exp = | FunctionNode | ClassNode
 *
 * edges[1]:
 *   Types.ts --CONTAINS--> Node
 *
 * ---mermaid---
 * graph LR
 *   n0["Types.ts"]
 *   n1["Node"]
 *   n0 -->|contains| n1
 * ```
 *
 * Key optimizations:
 * - Center node shown once with full details (not duplicated in groups)
 * - Nodes grouped hierarchically by file, then by type
 * - Edges use symbol names (not full IDs) for readability
 * - Only relevant edge metadata included (callCount only for CALLS)
 *
 * @param result - The neighbor query result
 * @param distance - Query distance parameter
 * @param direction - Query direction parameter
 * @returns Formatted string for LLM consumption
 */
export function formatNeighbors(
	result: NeighborResult,
	distance: number,
	direction: Direction,
): string {
	const { center, nodes, edges } = result;
	const lines: string[] = [];

	// Header with center node info
	lines.push(`center: ${center.id}`);
	lines.push(`centerType: ${center.type}`);
	lines.push("centerData:");
	lines.push(...formatCenterData(center));
	lines.push(`distance: ${distance}`);
	lines.push(`direction: ${direction}`);

	// Exclude center from neighbor nodes
	const neighborNodes = nodes.filter((n) => n.id !== center.id);
	lines.push(`nodeCount: ${neighborNodes.length}`);
	lines.push(`edgeCount: ${edges.length}`);
	lines.push("");

	// Group neighbors by file, then by type
	if (neighborNodes.length > 0) {
		const fileGroups = groupByFileAndType(neighborNodes);
		// Include File type for neighbors (unlike other tools that exclude it)
		const typeOrder: NodeType[] = [...TYPE_ORDER, "File"];

		for (const [filePath, typeGroups] of fileGroups) {
			let fileNodeCount = 0;
			for (const typeNodes of typeGroups.values()) {
				fileNodeCount += typeNodes.length;
			}

			lines.push(`${filePath} (${fileNodeCount} nodes):`);

			for (const type of typeOrder) {
				const typeNodes = typeGroups.get(type);
				if (!typeNodes || typeNodes.length === 0) continue;

				const plural = TYPE_PLURALS[type];
				lines.push(`  ${plural}[${typeNodes.length}]:`);

				for (const node of typeNodes) {
					lines.push(`    ${formatNode(node)}`);
				}
			}
			lines.push("");
		}
	} else {
		lines.push("(no neighbors found)");
		lines.push("");
	}

	// Edges section
	if (edges.length > 0) {
		lines.push(`edges[${edges.length}]:`);
		for (const edge of edges) {
			lines.push(`  ${formatEdge(edge)}`);
		}
		lines.push("");
	}

	// Mermaid diagram
	lines.push("---mermaid---");
	lines.push(generateMermaid(nodes, edges));

	return lines.join("\n");
}
