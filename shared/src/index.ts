export const NODE_TYPES = [
  "Function",
  "Class",
  "Method",
  "Interface",
  "TypeAlias",
  "Variable"
] as const

export type NodeType = typeof NODE_TYPES[number];

export const RUNTIME_EDGE_TYPES = [
  "CALLS",
  "REFERENCES",
  "USES_TYPE",
] as const

export const COMPILE_TIME_EDGE_TYPES = [
  "EXTENDS",
  "INCLUDES",
  "IMPLEMENTS",
  "TAKES",
  "RETURNS",
  "HAS_TYPE",
  "HAS_PROPERTY",
  "DERIVES_FROM",
  "ALIAS_FOR",
] as const

export const EDGE_TYPES = [
  ...RUNTIME_EDGE_TYPES,
  ...COMPILE_TIME_EDGE_TYPES,
] as const

export type RuntimeEdgeType = typeof RUNTIME_EDGE_TYPES[number];
export type CompileTimeEdgeType = typeof COMPILE_TIME_EDGE_TYPES[number];
export type EdgeType = typeof EDGE_TYPES[number];

// Call Site Range (line numbers where a call occurs)
export interface CallSiteRange {
  /** Start line number (1-indexed) */
  start: number;
  /** End line number (1-indexed) */
  end: number;
}

// Base Node (shared properties)
export interface BaseNode {
  /** Unique ID: "{relativePath}:{symbolPath}" e.g., "src/utils.ts:formatDate" */
  id: string;

  /** Node type discriminator */
  type: NodeType;

  /** Symbol name (e.g., "formatDate", "User") */
  name: string;

  /** Package name from config */
  package: string;

  /** Relative file path */
  filePath: string;

  /** Start line number (1-indexed) */
  startLine: number;

  /** End line number (1-indexed) */
  endLine: number;

  /** Whether exported from module */
  exported: boolean;
}

// Node Variants (Discriminated Union)
export interface FunctionNode extends BaseNode {
  type: "Function";
  parameters?: Array<{ name: string; type?: string }>;
  returnType?: string;
  async?: boolean;
}

export interface ClassNode extends BaseNode {
  type: "Class";
  extends?: string;
  implements?: string[];
}

export interface MethodNode extends BaseNode {
  type: "Method";
  parameters?: Array<{ name: string; type?: string }>;
  returnType?: string;
  async?: boolean;
  visibility?: "public" | "private" | "protected";
  static?: boolean;
}

export interface InterfaceNode extends BaseNode {
  type: "Interface";
  extends?: string[];
}

export interface TypeAliasNode extends BaseNode {
  type: "TypeAlias";
  aliasedType?: string;
}

export interface VariableNode extends BaseNode {
  type: "Variable";
  variableType?: string;
  isConst?: boolean;
}

export type Node =
  | FunctionNode
  | ClassNode
  | MethodNode
  | InterfaceNode
  | TypeAliasNode
  | VariableNode

// Edge
export interface Edge {
  /** Source node ID */
  source: string;

  /** Target node ID */
  target: string;

  /** Edge type */
  type: EdgeType;

  /** Rich metadata (varies by edge type) */

  // CALLS edges
  callCount?: number;
  callSites?: CallSiteRange[]; // Line ranges where calls occur

  // IMPORTS edges
  isTypeOnly?: boolean;
  importedSymbols?: string[];

  // USES_TYPE edges
  context?: "parameter" | "return" | "property" | "variable";

  // REFERENCES edges
  referenceContext?:
    | "callback"
    | "property"
    | "array"
    | "return"
    | "assignment"
    | "access";
}

// API Response Types
export interface SymbolSearchResult {
  file_path: string;
  symbol: string;
  type: NodeType;
}

export interface HealthResponse {
  status: "ok" | "error";
  ready: boolean;
  indexed_files: number;
}

// Output format for API
export type OutputFormat = "mcp" | "mermaid" | "md";
