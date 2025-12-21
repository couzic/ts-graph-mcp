import type { Node, NodeType } from "../../db/Types.js";

/**
 * Extract symbol name from full node ID.
 * Example: "src/db/Types.ts:BaseNode" → "BaseNode"
 * Example: "src/db/Types.ts:BaseNode.id" → "BaseNode.id"
 */
export function extractSymbol(nodeId: string): string {
	const colonIndex = nodeId.indexOf(":");
	return colonIndex >= 0 ? nodeId.slice(colonIndex + 1) : nodeId;
}

/**
 * Format line range as compact notation.
 * Example: startLine=24, endLine=51 → "24-51"
 * Example: startLine=26, endLine=26 → "26"
 */
export function formatLines(startLine: number, endLine: number): string {
	return startLine === endLine ? `${startLine}` : `${startLine}-${endLine}`;
}

/**
 * Returns location data formatted for direct use with the Read tool.
 * offset = startLine (1-indexed)
 * limit = number of lines
 */
export function formatLocation(node: { startLine: number; endLine: number }): {
	offset: number;
	limit: number;
} {
	return {
		offset: node.startLine,
		limit: node.endLine - node.startLine + 1,
	};
}

/**
 * Format a function node for output.
 */
export function formatFunction(node: Node & { type: "Function" }): string {
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
export function formatClass(node: Node & { type: "Class" }): string {
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
export function formatMethod(node: Node & { type: "Method" }): string {
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
export function formatInterface(node: Node & { type: "Interface" }): string {
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
export function formatTypeAlias(node: Node & { type: "TypeAlias" }): string {
	const symbol = extractSymbol(node.id);
	const lines = formatLines(node.startLine, node.endLine);
	const exp = node.exported ? " exp" : "";
	const alias = node.aliasedType ? ` = ${node.aliasedType}` : "";
	return `${symbol} [${lines}]${exp}${alias}`;
}

/**
 * Format a variable node for output.
 */
export function formatVariable(node: Node & { type: "Variable" }): string {
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
export function formatProperty(node: Node & { type: "Property" }): string {
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
export function formatFile(node: Node & { type: "File" }): string {
	const symbol = extractSymbol(node.id);
	const lines = formatLines(node.startLine, node.endLine);
	return `${symbol} [${lines}]`;
}

/**
 * Format a single node based on its type.
 */
export function formatNode(node: Node): string {
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
export function groupByType(nodes: Node[]): Map<NodeType, Node[]> {
	const groups = new Map<NodeType, Node[]>();
	for (const node of nodes) {
		const existing = groups.get(node.type) ?? [];
		existing.push(node);
		groups.set(node.type, existing);
	}
	return groups;
}

/**
 * Group nodes by file path.
 */
export function groupByFile(nodes: Node[]): Map<string, Node[]> {
	const groups = new Map<string, Node[]>();
	for (const node of nodes) {
		const existing = groups.get(node.filePath) ?? [];
		existing.push(node);
		groups.set(node.filePath, existing);
	}
	return groups;
}

/**
 * Group nodes by depth (for nodes with depth property).
 */
export function groupByDepth<T extends Node & { depth: number }>(
	nodes: T[],
): Map<number, T[]> {
	const groups = new Map<number, T[]>();
	for (const node of nodes) {
		const existing = groups.get(node.depth) ?? [];
		existing.push(node);
		groups.set(node.depth, existing);
	}
	return groups;
}
