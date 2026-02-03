import type { EdgeType } from "@ts-graph/shared";
import type { CallSiteRange, Edge } from "../../db/Types.js";
import type { EdgeRow, NodeRow } from "./QueryTypes.js";

// Re-export types for convenience
export type { EdgeRow, NodeRow };

/**
 * Convert a database row to an Edge domain object.
 *
 * Handles:
 * - snake_case to camelCase conversion
 * - JSON parsing of call_sites array
 * - Only includes optional fields when present
 */
export const rowToEdge = (row: EdgeRow): Edge => {
  const edge: Edge = {
    source: row.source,
    target: row.target,
    type: row.type as EdgeType,
  };
  if (row.call_count != null) {
    edge.callCount = row.call_count;
  }
  if (row.call_sites != null) {
    edge.callSites = JSON.parse(row.call_sites) as CallSiteRange[];
  }
  if (row.context != null) {
    edge.context = row.context as Edge["context"];
  }
  if (row.reference_context != null) {
    edge.referenceContext = row.reference_context as Edge["referenceContext"];
  }
  return edge;
};
