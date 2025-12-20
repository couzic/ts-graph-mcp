import type { Edge, EdgeType, Node, NodeType } from "../../db/Types.js";
import { TYPE_ORDER, TYPE_PLURALS } from "../shared/formatConstants.js";
import {
	extractSymbol,
	formatLocation,
	formatNode,
} from "../shared/nodeFormatters.js";
import type { SymbolLocation } from "../shared/resolveSymbol.js";
import type { Direction, NeighborResult } from "./query.js";

export type OutputType = "text" | "mermaid";

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
 * target:
 *   name: Node
 *   type: TypeAlias
 *   file: src/db/Types.ts
 *   offset: 104
 *   limit: 9
 *   module: core
 *   package: main
 *
 * distance: 1
 * direction: both
 * neighbors[2]:
 * edges[1]:
 *
 * src/db/Types.ts (2 nodes):
 *   files[1]:
 *     Types.ts [1-233]
 *       offset: 1, limit: 233
 *   typeAliases[1]:
 *     Node [104-112] exp = | FunctionNode | ClassNode
 *       offset: 104, limit: 9
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
 * - Target node shown once with location (offset/limit for Read tool)
 * - Nodes grouped hierarchically by file, then by type
 * - All nodes include offset/limit for Read tool compatibility
 * - Edges use symbol names (not full IDs) for readability
 * - Only relevant edge metadata included (callCount only for CALLS)
 * - Mermaid diagram only included if requested via outputTypes
 *
 * @param result - The neighbor query result
 * @param target - The target (center) node location
 * @param distance - Query distance parameter
 * @param direction - Query direction parameter
 * @param outputTypes - Which output formats to include
 * @returns Formatted string for LLM consumption
 */
export function formatNeighbors(
	result: NeighborResult,
	target: SymbolLocation,
	distance: number,
	direction: Direction,
	outputTypes: OutputType[],
): string {
	const { nodes, edges } = result;
	const lines: string[] = [];

	// Header - machine-readable location for Read tool
	lines.push("target:");
	lines.push(`  name: ${target.name}`);
	lines.push(`  type: ${target.type}`);
	lines.push(`  file: ${target.file}`);
	lines.push(`  offset: ${target.offset}`);
	lines.push(`  limit: ${target.limit}`);
	lines.push(`  module: ${target.module}`);
	lines.push(`  package: ${target.package}`);
	lines.push("");
	lines.push(`distance: ${distance}`);
	lines.push(`direction: ${direction}`);

	// Exclude target from neighbor nodes
	const neighborNodes = nodes.filter((n) => n.id !== target.id);
	lines.push(`neighbors[${neighborNodes.length}]:`);
	lines.push(`edges[${edges.length}]:`);
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
					const loc = formatLocation(node);
					lines.push(`    ${formatNode(node)}`);
					lines.push(`      offset: ${loc.offset}, limit: ${loc.limit}`);
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

	// Mermaid diagram (only if requested)
	if (outputTypes.includes("mermaid")) {
		lines.push("---mermaid---");
		lines.push(generateMermaid(nodes, edges));
	}

	return lines.join("\n").trimEnd();
}
