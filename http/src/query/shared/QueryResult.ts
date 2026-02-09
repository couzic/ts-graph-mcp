import type { EdgeWithCallSites } from "./formatToolOutput.js";
import type { NodeInfo } from "./GraphTypes.js";
import type { NodeMetadata } from "./queryNodeMetadata.js";

/**
 * Structured query result that both MCP and Mermaid formatters consume.
 *
 * @example
 * const result = dependenciesData(db, filePath, symbol);
 * const mcp = formatMcpFromResult(result);
 * const mermaid = formatMermaidFromResult(result);
 */
export type QueryResult = {
  edges: EdgeWithCallSites[];
  nodes: NodeInfo[];
  aliasMap: Map<string, string>;
  metadataByNodeId: Map<string, NodeMetadata>;
  maxNodes?: number;
  message?: string;
};

/**
 * Create a QueryResult with no graph data, just a message.
 *
 * @example
 * const result = messageResult("No dependencies found.");
 */
export const messageResult = (message: string): QueryResult => ({
  edges: [],
  nodes: [],
  aliasMap: new Map(),
  metadataByNodeId: new Map(),
  message,
});
