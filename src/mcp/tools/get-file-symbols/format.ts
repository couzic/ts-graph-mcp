import type { Node, NodeType } from "../../../db/Types.js";

/**
 * Node type to plural key mapping.
 */
const TYPE_PLURALS: Record<NodeType, string> = {
	Function: "functions",
	Class: "classes",
	Method: "methods",
	Interface: "interfaces",
	TypeAlias: "typeAliases",
	Variable: "variables",
	File: "files",
	Property: "properties",
};

/**
 * Extract symbol name from full node ID.
 * Example: "src/db/Types.ts:BaseNode" → "BaseNode"
 * Example: "src/db/Types.ts:BaseNode.id" → "BaseNode.id"
 */
function extractSymbol(nodeId: string): string {
	const colonIndex = nodeId.indexOf(":");
	return colonIndex >= 0 ? nodeId.slice(colonIndex + 1) : nodeId;
}

/**
 * Format line range as compact notation.
 * Example: startLine=24, endLine=51 → "24-51"
 * Example: startLine=26, endLine=26 → "26"
 */
function formatLines(startLine: number, endLine: number): string {
	return startLine === endLine ? `${startLine}` : `${startLine}-${endLine}`;
}

/**
 * Format a function node for output.
 */
function formatFunction(node: Node & { type: "Function" }): string {
	const symbol = extractSymbol(node.id);
	const lines = formatLines(node.startLine, node.endLine);
	const exp = node.exported ? " exp" : "";
	const async = node.async ? " async" : "";
	const params =
		node.parameters?.map((p) => `${p.name}:${p.type ?? "?"}`).join(",") ?? "";
	const returns = node.returnType ?? "void";
	return `${symbol} [${lines}]${exp}${async} (${params}) → ${returns}`;
}

/**
 * Format a class node for output.
 */
function formatClass(node: Node & { type: "Class" }): string {
	const symbol = extractSymbol(node.id);
	const lines = formatLines(node.startLine, node.endLine);
	const exp = node.exported ? " exp" : "";
	const ext = node.extends ? ` extends:${node.extends}` : "";
	const impl = node.implements?.length
		? ` implements:[${node.implements.join(",")}]`
		: "";
	return `${symbol} [${lines}]${exp}${ext}${impl}`;
}

/**
 * Format a method node for output.
 */
function formatMethod(node: Node & { type: "Method" }): string {
	const symbol = extractSymbol(node.id);
	const lines = formatLines(node.startLine, node.endLine);
	const vis =
		node.visibility && node.visibility !== "public"
			? ` ${node.visibility}`
			: "";
	const stat = node.static ? " static" : "";
	const async = node.async ? " async" : "";
	const params =
		node.parameters?.map((p) => `${p.name}:${p.type ?? "?"}`).join(",") ?? "";
	const returns = node.returnType ?? "void";
	return `${symbol} [${lines}]${vis}${stat}${async} (${params}) → ${returns}`;
}

/**
 * Format an interface node for output.
 */
function formatInterface(node: Node & { type: "Interface" }): string {
	const symbol = extractSymbol(node.id);
	const lines = formatLines(node.startLine, node.endLine);
	const exp = node.exported ? " exp" : "";
	const ext = node.extends?.length
		? ` extends:[${node.extends.join(",")}]`
		: "";
	return `${symbol} [${lines}]${exp}${ext}`;
}

/**
 * Format a type alias node for output.
 */
function formatTypeAlias(node: Node & { type: "TypeAlias" }): string {
	const symbol = extractSymbol(node.id);
	const lines = formatLines(node.startLine, node.endLine);
	const exp = node.exported ? " exp" : "";
	const alias = node.aliasedType ? ` = ${node.aliasedType}` : "";
	return `${symbol} [${lines}]${exp}${alias}`;
}

/**
 * Format a variable node for output.
 */
function formatVariable(node: Node & { type: "Variable" }): string {
	const symbol = extractSymbol(node.id);
	const lines = formatLines(node.startLine, node.endLine);
	const exp = node.exported ? " exp" : "";
	const con = node.isConst ? " const" : "";
	const typ = node.variableType ? `: ${node.variableType}` : "";
	return `${symbol} [${lines}]${exp}${con}${typ}`;
}

/**
 * Format a property node for output.
 */
function formatProperty(node: Node & { type: "Property" }): string {
	const symbol = extractSymbol(node.id);
	const lines = formatLines(node.startLine, node.endLine);
	const opt = node.optional ? "?" : "";
	const ro = node.readonly ? " ro" : "";
	const typ = node.propertyType ?? "unknown";
	return `${symbol}${opt} [${lines}]${ro}: ${typ}`;
}

/**
 * Format a file node for output.
 */
function formatFile(node: Node & { type: "File" }): string {
	const symbol = extractSymbol(node.id);
	const lines = formatLines(node.startLine, node.endLine);
	return `${symbol} [${lines}]`;
}

/**
 * Format a single node based on its type.
 */
function formatNode(node: Node): string {
	switch (node.type) {
		case "Function":
			return formatFunction(node);
		case "Class":
			return formatClass(node);
		case "Method":
			return formatMethod(node);
		case "Interface":
			return formatInterface(node);
		case "TypeAlias":
			return formatTypeAlias(node);
		case "Variable":
			return formatVariable(node);
		case "Property":
			return formatProperty(node);
		case "File":
			return formatFile(node);
	}
}

/**
 * Group nodes by type.
 */
function groupByType(nodes: Node[]): Map<NodeType, Node[]> {
	const groups = new Map<NodeType, Node[]>();
	for (const node of nodes) {
		const existing = groups.get(node.type) ?? [];
		existing.push(node);
		groups.set(node.type, existing);
	}
	return groups;
}

/**
 * Format file symbols for LLM consumption.
 *
 * Output format:
 * ```
 * module: ts-graph-mcp
 * package: main
 * filePath: src/db/Types.ts
 * count: 88
 *
 * interfaces[17]:
 *   BaseNode [24-51] exp
 *   FunctionNode [54-59] exp extends:[BaseNode]
 *   ...
 *
 * properties[66]:
 *   BaseNode.id [26]: string
 *   ...
 * ```
 *
 * Derivation rules (for LLM to reconstruct full data):
 * - Full ID = filePath + ":" + symbol (e.g., "src/db/Types.ts:BaseNode")
 * - name = last segment of symbol after "." (e.g., "id" from "BaseNode.id")
 */
export function formatFileSymbols(filePath: string, nodes: Node[]): string {
	if (nodes.length === 0) {
		return `filePath: ${filePath}\ncount: 0\n\n(no symbols found)`;
	}

	// Extract common metadata (all nodes same file)
	const module = nodes[0]?.module ?? "";
	const pkg = nodes[0]?.package ?? "";

	const lines: string[] = [];

	// Header with hoisted metadata
	lines.push(`module: ${module}`);
	lines.push(`package: ${pkg}`);
	lines.push(`filePath: ${filePath}`);
	lines.push(`count: ${nodes.length}`);
	lines.push("");

	// Group by type and format
	const groups = groupByType(nodes);

	// Output in a consistent order (skip File nodes - they're metadata)
	const typeOrder: NodeType[] = [
		"Interface",
		"TypeAlias",
		"Class",
		"Function",
		"Variable",
		"Method",
		"Property",
	];

	for (const type of typeOrder) {
		const typeNodes = groups.get(type);
		if (!typeNodes || typeNodes.length === 0) continue;

		const plural = TYPE_PLURALS[type];
		lines.push(`${plural}[${typeNodes.length}]:`);

		for (const node of typeNodes) {
			lines.push(`  ${formatNode(node)}`);
		}

		lines.push("");
	}

	return lines.join("\n").trimEnd();
}
