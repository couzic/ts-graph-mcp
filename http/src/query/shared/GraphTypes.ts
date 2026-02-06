import type { EdgeType, NodeType } from "@ts-graph/shared";
import type { CallSiteRange } from "../../db/Types.js";

/**
 * A line of code with its line number.
 */
export interface LOC {
  line: number;
  code: string;
}

/**
 * An edge in the code graph.
 */
export interface GraphEdge {
  source: string; // Node ID (e.g., "src/utils.ts:formatDate")
  target: string; // Node ID
  type: EdgeType;
}

/**
 * Node information for the Nodes section.
 */
export interface NodeInfo {
  id: string;
  name: string;
  type: NodeType;
  filePath: string;
  startLine: number;
  endLine: number;
  snippet: string; // Source code snippet from DB
  callSites?: CallSiteRange[]; // Line ranges where this node is called (from edges)
  locs?: LOC[]; // Pre-loaded lines of code for snippet display
}
