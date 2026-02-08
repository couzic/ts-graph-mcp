import type Database from "better-sqlite3";
import { collectNodeIds } from "../shared/collectNodeIds.js";
import {
  enrichNodesWithCallSites,
  formatToolOutput,
} from "../shared/formatToolOutput.js";
import { loadNodeSnippets } from "../shared/loadNodeSnippets.js";
import type { GraphEdgeWithCallSites } from "../shared/parseEdgeRows.js";
import { queryAliasMap } from "../shared/queryAliasMap.js";
import { queryNodeInfos } from "../shared/queryNodeInfos.js";

/**
 * Input for formatting a filtered traversal result.
 */
export interface FormatFilteredTraversalInput {
  /** Database connection */
  db: Database.Database;
  /** Edges in the traversal (already filtered) */
  edges: GraphEdgeWithCallSites[];
  /** Node ID of the starting point (to exclude from Nodes section) */
  startNodeId: string;
  /** Maximum nodes in output */
  maxNodes?: number;
  /** Message to prepend (e.g., resolution message) */
  prependMessage?: string;
}

/**
 * Format a filtered traversal result into the standard tool output format.
 *
 * This is used when edges have been filtered (e.g., by topic) and need to be
 * formatted into the Graph + Nodes sections.
 */
export const formatFilteredTraversal = (
  input: FormatFilteredTraversalInput,
): string => {
  const { db, edges, startNodeId, maxNodes, prependMessage } = input;

  if (edges.length === 0) {
    const noResults = "No results found matching the filter.";
    return prependMessage ? `${prependMessage}\n\n${noResults}` : noResults;
  }

  // Collect node IDs from filtered edges
  const nodeIds = collectNodeIds(edges);

  // Query alias map for display simplification
  const aliasMap = queryAliasMap(db, nodeIds);

  // Exclude start node from Nodes section (already known to the agent)
  const nodeIdsToQuery = nodeIds.filter((id) => id !== startNodeId);

  // Query node information
  const nodes = queryNodeInfos(db, nodeIdsToQuery);

  // Enrich with call sites BEFORE loading snippets
  const enrichedNodes = enrichNodesWithCallSites(nodes, edges);

  const nodesWithSnippets = loadNodeSnippets(enrichedNodes, nodes.length);

  // Format output
  const output = formatToolOutput({
    edges,
    nodes: nodesWithSnippets,
    maxNodes,
    aliasMap,
  });

  return prependMessage ? `${prependMessage}\n\n${output}` : output;
};
