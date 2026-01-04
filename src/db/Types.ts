// Node Types
export type NodeType =
  | "Function"
  | "Class"
  | "Method"
  | "Interface"
  | "TypeAlias"
  | "Variable"
  | "File"
  | "Property";

// Edge Types
export type EdgeType =
  | "CALLS"
  | "IMPORTS"
  | "CONTAINS"
  | "IMPLEMENTS"
  | "EXTENDS"
  | "USES_TYPE"
  | "REFERENCES"
  | "INCLUDES";

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

export interface FileNode extends BaseNode {
  type: "File";
  extension?: string;
}

export interface PropertyNode extends BaseNode {
  type: "Property";
  propertyType?: string;
  optional?: boolean;
  readonly?: boolean;
}

export type Node =
  | FunctionNode
  | ClassNode
  | MethodNode
  | InterfaceNode
  | TypeAliasNode
  | VariableNode
  | FileNode
  | PropertyNode;

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

// Path
export interface Path {
  /** Starting node ID */
  start: string;

  /** Ending node ID */
  end: string;

  /** Ordered node IDs (including start and end) */
  nodes: string[];

  /** Ordered edges connecting the nodes */
  edges: Edge[];

  /** Path length (number of edges) */
  length: number;
}

// Search and Traversal Options
export interface SearchFilters {
  /** Filter by node type(s) */
  type?: NodeType | NodeType[];

  /** Filter by package name(s) */
  package?: string | string[];

  /** Filter by export status */
  exported?: boolean;

  /** Skip first N results (pagination) */
  offset?: number;

  /** Max results to return (pagination, default: 100) */
  limit?: number;
}

export interface TraversalOptions {
  /** Maximum traversal depth */
  maxDepth?: number;

  /** Filter by edge type(s) */
  edgeTypes?: EdgeType[];
}

export interface NeighborOptions {
  /** Maximum distance from center node (number of edges) */
  distance: number;

  /** Direction to traverse edges */
  direction?: "outgoing" | "incoming" | "both";

  /** Filter by edge type(s). If omitted, all edge types are traversed */
  edgeTypes?: EdgeType[];
}

// Subgraph
export interface Subgraph {
  /** The center node of this subgraph */
  center: Node;

  /** All nodes in the subgraph (including center) */
  nodes: Node[];

  /** All edges connecting nodes in the subgraph */
  edges: Edge[];
}

// Mermaid Options
export interface MermaidOptions {
  /** Graph direction: 'LR' (left-right) or 'TD' (top-down). Default: 'LR' */
  direction?: "LR" | "TD";
}

// Index Result
export interface IndexResult {
  /** Number of files processed */
  filesProcessed: number;

  /** Relative paths of files that were indexed */
  filesIndexed: string[];

  /** Number of nodes added */
  nodesAdded: number;

  /** Number of edges added */
  edgesAdded: number;

  /** Duration in milliseconds */
  durationMs: number;

  /** Errors encountered (non-fatal) */
  errors?: Array<{
    file: string;
    message: string;
  }>;
}
