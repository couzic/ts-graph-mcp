import type { CallSiteRange, EdgeType } from "../../db/Types.js";

/**
 * Raw edge row from SQLite with call sites as JSON string.
 */
export interface EdgeRowWithCallSites {
  source: string;
  target: string;
  type: string;
  call_sites: string | null;
}

/**
 * Graph edge with parsed call sites.
 * Extends the basic GraphEdge with call site information.
 */
export interface GraphEdgeWithCallSites {
  source: string;
  target: string;
  type: EdgeType;
  callSites?: CallSiteRange[];
}

/**
 * Parse raw edge rows into GraphEdgeWithCallSites.
 * Handles JSON parsing of call_sites column.
 */
export const parseEdgeRows = (
  rows: EdgeRowWithCallSites[],
): GraphEdgeWithCallSites[] => {
  return rows.map((row) => ({
    source: row.source,
    target: row.target,
    type: row.type as EdgeType,
    callSites: row.call_sites ? JSON.parse(row.call_sites) : undefined,
  }));
};
