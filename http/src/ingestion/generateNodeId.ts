import type { FilePath, NodeId, NodeType, SymbolName } from "@ts-graph/shared";
import { normalizePath } from "./normalizePath.js";

/**
 * Generate a node ID from file path, node type, and symbol name.
 *
 * Format: `{path}:{type}:{symbol}`
 *
 * @spec indexing::node-id-format
 * @spec graph-model::node-id.format
 * @spec graph-model::node-id.forward-slashes
 *
 * @example
 * generateNodeId("src/utils.ts", "Function", "formatDate")
 * // => "src/utils.ts:Function:formatDate"
 */
export const generateNodeId = (
  filePath: FilePath,
  nodeType: NodeType,
  symbolName: SymbolName,
): NodeId => {
  const normalizedPath = normalizePath(filePath);
  return `${normalizedPath}:${nodeType}:${symbolName}`;
};
