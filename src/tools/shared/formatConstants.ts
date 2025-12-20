import type { NodeType } from "../../db/Types.js";

/**
 * Node type to plural key mapping for output formatting.
 */
export const TYPE_PLURALS: Record<NodeType, string> = {
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
 * Preferred ordering of node types in formatted output.
 * File nodes are typically excluded as they're metadata.
 */
export const TYPE_ORDER: NodeType[] = [
	"Interface",
	"TypeAlias",
	"Class",
	"Function",
	"Variable",
	"Method",
	"Property",
];
