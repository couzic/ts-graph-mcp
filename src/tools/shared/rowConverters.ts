import type {
  CallSiteRange,
  Edge,
  EdgeType,
  Node,
  NodeType,
} from "../../db/Types.js";
import type { EdgeRow, NodeRow } from "./QueryTypes.js";

// Re-export types for convenience
export type { EdgeRow, NodeRow };

/**
 * Convert a database row to a Node domain object.
 *
 * Handles:
 * - snake_case to camelCase conversion
 * - JSON parsing of properties
 * - Boolean conversion for exported flag
 */
export const rowToNode = (row: NodeRow): Node => {
  const properties = JSON.parse(row.properties) as Record<string, unknown>;
  return {
    id: row.id,
    type: row.type as NodeType,
    name: row.name,
    module: row.module,
    package: row.package,
    filePath: row.file_path,
    startLine: row.start_line,
    endLine: row.end_line,
    exported: row.exported === 1,
    ...properties,
  } as Node;
};

/**
 * Convert a database row to an Edge domain object.
 *
 * Handles:
 * - snake_case to camelCase conversion
 * - JSON parsing of imported_symbols array
 * - Boolean conversion for is_type_only flag
 * - Only includes optional fields when present
 */
export const rowToEdge = (row: EdgeRow): Edge => {
  const edge: Edge = {
    source: row.source,
    target: row.target,
    type: row.type as EdgeType,
  };
  if (row.call_count != null) edge.callCount = row.call_count;
  if (row.call_sites != null)
    edge.callSites = JSON.parse(row.call_sites) as CallSiteRange[];
  if (row.is_type_only != null) edge.isTypeOnly = row.is_type_only === 1;
  if (row.imported_symbols != null)
    edge.importedSymbols = JSON.parse(row.imported_symbols) as string[];
  if (row.context != null) edge.context = row.context as Edge["context"];
  return edge;
};
