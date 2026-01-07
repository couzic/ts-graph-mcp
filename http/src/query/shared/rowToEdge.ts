import type { CallSiteRange, Edge, EdgeType } from "../../db/Types.js";
import type { EdgeRow, NodeRow } from "./QueryTypes.js";

// Re-export types for convenience
export type { EdgeRow, NodeRow };

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
