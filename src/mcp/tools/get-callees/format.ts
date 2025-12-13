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
 * Group nodes by file path, then by type within each file.
 */
interface FileGroup {
	filePath: string;
	module: string;
	package: string;
	nodesByType: Map<NodeType, Node[]>;
}

function groupByFileAndType(nodes: Node[]): FileGroup[] {
	const fileMap = new Map<string, FileGroup>();

	for (const node of nodes) {
		let group = fileMap.get(node.filePath);
		if (!group) {
			group = {
				filePath: node.filePath,
				module: node.module,
				package: node.package,
				nodesByType: new Map(),
			};
			fileMap.set(node.filePath, group);
		}

		const existing = group.nodesByType.get(node.type) ?? [];
		existing.push(node);
		group.nodesByType.set(node.type, existing);
	}

	return Array.from(fileMap.values()).sort((a, b) =>
		a.filePath.localeCompare(b.filePath),
	);
}

/**
 * Format callees for LLM consumption using hierarchical file grouping.
 *
 * Output format:
 * ```
 * sourceId: src/api/handler.ts:createUser
 * count: 5
 *
 * === src/db/user.ts (module: core, package: main) ===
 *
 * functions[2]:
 *   saveUser [10-15] exp (user:User) → Promise<void>
 *   validateUser [20-25] (user:User) → boolean
 *
 * === src/utils/logger.ts (module: core, package: main) ===
 *
 * functions[1]:
 *   logInfo [5-7] exp (msg:string) → void
 * ```
 */
export function formatCallees(sourceId: string, nodes: Node[]): string {
	if (nodes.length === 0) {
		return `sourceId: ${sourceId}\ncount: 0\n\n(no callees found)`;
	}

	const lines: string[] = [];

	// Header
	lines.push(`sourceId: ${sourceId}`);
	lines.push(`count: ${nodes.length}`);
	lines.push("");

	// Group by file, then by type
	const fileGroups = groupByFileAndType(nodes);

	// Type order for consistent output
	const typeOrder: NodeType[] = [
		"Interface",
		"TypeAlias",
		"Class",
		"Function",
		"Variable",
		"Method",
		"Property",
	];

	for (const fileGroup of fileGroups) {
		// File header
		lines.push(
			`=== ${fileGroup.filePath} (module: ${fileGroup.module}, package: ${fileGroup.package}) ===`,
		);
		lines.push("");

		// Output types in order
		for (const type of typeOrder) {
			const typeNodes = fileGroup.nodesByType.get(type);
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
