import type { Node, NodeType } from "../../db/Types.js";

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
 * Group nodes by file path.
 */
function groupByFile(nodes: Node[]): Map<string, Node[]> {
	const groups = new Map<string, Node[]>();
	for (const node of nodes) {
		const existing = groups.get(node.filePath) ?? [];
		existing.push(node);
		groups.set(node.filePath, existing);
	}
	return groups;
}

/**
 * Format search results for LLM consumption.
 *
 * Output format groups nodes by file, then by type within each file:
 * ```
 * count: 42
 * files: 5
 *
 * file: src/db/Types.ts
 * module: ts-graph-mcp
 * package: main
 * matches: 17
 *
 * interfaces[10]:
 *   BaseNode [24-51] exp
 *   FunctionNode [54-59] exp extends:[BaseNode]
 *   ...
 *
 * properties[7]:
 *   BaseNode.id [26]: string
 *   ...
 *
 * file: src/utils/helpers.ts
 * ...
 * ```
 *
 * Derivation rules (for LLM to reconstruct full data):
 * - Full ID = filePath + ":" + symbol (e.g., "src/db/Types.ts:BaseNode")
 * - name = last segment of symbol after "." (e.g., "id" from "BaseNode.id")
 */
export function formatSearchResults(nodes: Node[]): string {
	if (nodes.length === 0) {
		return "count: 0\n\n(no matches found)";
	}

	const lines: string[] = [];
	const fileGroups = groupByFile(nodes);

	// Overall summary
	lines.push(`count: ${nodes.length}`);
	lines.push(`files: ${fileGroups.size}`);
	lines.push("");

	// Type order (skip File nodes - they're metadata)
	const typeOrder: NodeType[] = [
		"Interface",
		"TypeAlias",
		"Class",
		"Function",
		"Variable",
		"Method",
		"Property",
	];

	// Process each file
	for (const [filePath, fileNodes] of fileGroups) {
		// File header with metadata
		lines.push(`file: ${filePath}`);
		const module = fileNodes[0]?.module ?? "";
		const pkg = fileNodes[0]?.package ?? "";
		lines.push(`module: ${module}`);
		lines.push(`package: ${pkg}`);
		lines.push(`matches: ${fileNodes.length}`);
		lines.push("");

		// Group by type within this file
		const typeGroups = groupByType(fileNodes);

		for (const type of typeOrder) {
			const typeNodes = typeGroups.get(type);
			if (!typeNodes || typeNodes.length === 0) continue;

			const plural = TYPE_PLURALS[type];
			lines.push(`${plural}[${typeNodes.length}]:`);

			for (const node of typeNodes) {
				lines.push(`  ${formatNode(node)}`);
			}

			lines.push("");
		}
	}

	return lines.join("\n").trimEnd();
}
