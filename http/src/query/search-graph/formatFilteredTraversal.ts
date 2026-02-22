import type Database from "better-sqlite3";
import { collectNodeIds } from "../shared/collectNodeIds.js";
import type { GraphEdgeWithCallSites } from "../shared/parseEdgeRows.js";
import { messageResult, type QueryResult } from "../shared/QueryResult.js";
import { queryAliasMap } from "../shared/queryAliasMap.js";
import { queryNodeInfos } from "../shared/queryNodeInfos.js";
import { queryNodeMetadata } from "../shared/queryNodeMetadata.js";

/**
 * Input for building a QueryResult from filtered traversal edges.
 */
export interface FilteredTraversalInput {
  db: Database.Database;
  edges: GraphEdgeWithCallSites[];
  /** Node ID to exclude from the Nodes section (caller already knows it) */
  startNodeId?: string;
  maxNodes?: number;
  prependMessage?: string;
}

/**
 * Build a QueryResult from filtered traversal edges.
 *
 * Used when edges have been filtered (e.g., by topic) and need to be
 * packaged as a QueryResult.
 */
export const buildFilteredTraversalResult = (
  input: FilteredTraversalInput,
): QueryResult => {
  const { db, edges, startNodeId, maxNodes, prependMessage } = input;

  if (edges.length === 0) {
    const noResults = "No results found matching the filter.";
    return messageResult(
      prependMessage ? `${prependMessage}\n\n${noResults}` : noResults,
    );
  }

  const nodeIds = collectNodeIds(edges);
  const aliasMap = queryAliasMap(db, nodeIds);
  const metadataByNodeId = queryNodeMetadata(db, nodeIds);
  const nodeIdsToQuery = startNodeId
    ? nodeIds.filter((id) => id !== startNodeId)
    : nodeIds;
  const nodes = queryNodeInfos(db, nodeIdsToQuery);

  return {
    edges,
    nodes,
    aliasMap,
    metadataByNodeId,
    maxNodes,
    message: prependMessage,
  };
};
