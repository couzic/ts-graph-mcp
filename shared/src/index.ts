// TODO: Migrate callers to use branded types, then restore:
// export type FilePath = "FilePath";
// export type SymbolName = "SymbolName";
// export type NodeId = `${FilePath}:${NodeType}:${SymbolName}`;

/** Type alias for file paths (relative from project root). */
export type FilePath = string;

/** Type alias for symbol names (e.g., "formatDate" or "User.save"). */
export type SymbolName = string;

/** Type alias for node IDs (format: `{path}:{type}:{symbol}`). */
export type NodeId = string;

/** @spec graph-model::node-types */
export const NODE_TYPES = [
  "Function",
  "Class",
  "Method",
  "Interface",
  "TypeAlias",
  "Variable",
  "SyntheticType",
  "Feature",
  "Spec",
  "TestSuite",
  "Test",
] as const;

export type NodeType = (typeof NODE_TYPES)[number];

/** @spec graph-model::edge-types */
export const RUNTIME_EDGE_TYPES = ["CALLS", "REFERENCES", "USES_TYPE"] as const;

/** @spec graph-model::edge-types */
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
] as const;

export const TRACEABILITY_EDGE_TYPES = [
  "CONTAINS",
  "SPECIFIES",
  "VERIFIED_BY",
] as const;

export const EDGE_TYPES = [
  ...RUNTIME_EDGE_TYPES,
  ...COMPILE_TIME_EDGE_TYPES,
  ...TRACEABILITY_EDGE_TYPES,
] as const;

export type RuntimeEdgeType = (typeof RUNTIME_EDGE_TYPES)[number];
export type CompileTimeEdgeType = (typeof COMPILE_TIME_EDGE_TYPES)[number];
export type TraceabilityEdgeType = (typeof TRACEABILITY_EDGE_TYPES)[number];
export type EdgeType = (typeof EDGE_TYPES)[number];

/** @spec graph-model::edges.calls-metadata */
export interface CallSiteRange {
  /** Start line number (1-indexed) */
  start: number;
  /** End line number (1-indexed) */
  end: number;
}

/** @spec graph-model::nodes.base-properties */
export interface CoreNode {
  /** Unique ID: "{relativePath}:{symbolPath}" e.g., "src/utils.ts:formatDate" */
  id: NodeId;

  /** Node type discriminator */
  type: NodeType;

  /** Symbol name (e.g., "formatDate", "User") */
  name: string;

  /** Relative file path */
  filePath: string;

  /** Start line number (1-indexed) */
  startLine: number;

  /** End line number (1-indexed) */
  endLine: number;

  /** Whether exported from module */
  exported: boolean;
}

export interface BaseNode extends CoreNode {
  /** Package name from config */
  package: string;
}

export interface TraceabilityBaseNode extends CoreNode {
  /** Package name (optional for traceability nodes) */
  package?: string;
}

/** @spec graph-model::nodes.function-properties */
export interface FunctionNode extends BaseNode {
  type: "Function";
  parameters?: Array<{ name: string; type?: string }>;
  returnType?: string;
  async?: boolean;
}

/** @spec graph-model::nodes.class-properties */
export interface ClassNode extends BaseNode {
  type: "Class";
  extends?: string;
  implements?: string[];
}

/** @spec graph-model::nodes.method-properties */
export interface MethodNode extends BaseNode {
  type: "Method";
  parameters?: Array<{ name: string; type?: string }>;
  returnType?: string;
  async?: boolean;
  visibility?: "public" | "private" | "protected";
  static?: boolean;
}

/** @spec graph-model::nodes.interface-properties */
export interface InterfaceNode extends BaseNode {
  type: "Interface";
  extends?: string[];
}

/** @spec graph-model::nodes.type-alias-properties */
export interface TypeAliasNode extends BaseNode {
  type: "TypeAlias";
  aliasedType?: string;
}

/** @spec graph-model::nodes.variable-properties */
export interface VariableNode extends BaseNode {
  type: "Variable";
  variableType?: string;
  isConst?: boolean;
}

export interface FeatureNode extends TraceabilityBaseNode {
  type: "Feature";
}

export interface SpecNode extends TraceabilityBaseNode {
  type: "Spec";
}

export interface TestSuiteNode extends TraceabilityBaseNode {
  type: "TestSuite";
}

export interface TestNode extends TraceabilityBaseNode {
  type: "Test";
}

export type Node =
  | FunctionNode
  | ClassNode
  | MethodNode
  | InterfaceNode
  | TypeAliasNode
  | VariableNode
  | FeatureNode
  | SpecNode
  | TestSuiteNode
  | TestNode;

/** @spec graph-model::edges.composite-key */
export interface Edge {
  /** Source node ID */
  source: NodeId;

  /** Target node ID */
  target: NodeId;

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

// Graph search API request body
export type GraphSearchEndpoint = {
  query?: string;
  symbol?: string;
  file_path?: string;
};

export type GraphSearchRequest = {
  topic?: string;
  from?: GraphSearchEndpoint;
  to?: GraphSearchEndpoint;
  max_nodes?: number;
  format?: OutputFormat;
  direction?: "LR" | "TD";
};
