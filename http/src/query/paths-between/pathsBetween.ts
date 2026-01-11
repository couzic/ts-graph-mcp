import type Database from "better-sqlite3";
import {
  type EdgeWithCallSites,
  enrichNodesWithCallSites,
  formatToolOutput,
} from "../shared/formatToolOutput.js";
import { loadNodeSnippets } from "../shared/loadNodeSnippets.js";
import { queryNodeInfos } from "../shared/queryNodeInfos.js";
import type { QueryOptions } from "../shared/QueryTypes.js";
import { resolveSymbol } from "../shared/symbolNotFound.js";
import { queryPath } from "./query.js";

export interface SymbolRef {
  file_path: string | undefined;
  symbol: string;
}

/**
 * Find how two symbols connect through the code graph.
 *
 * "How does A reach B?"
 *
 * Bidirectional search: Finds the path regardless of which direction you specify.
 * The arrows in the output show the actual direction.
 */
export function pathsBetween(
  db: Database.Database,
  projectRoot: string,
  from: SymbolRef,
  to: SymbolRef,
  options: QueryOptions = {},
): string {
  // Resolve both symbols (handles exact match + method name auto-resolution)
  const fromResolution = resolveSymbol(db, from.file_path, from.symbol);
  if (!fromResolution.success) {
    return fromResolution.error;
  }

  const toResolution = resolveSymbol(db, to.file_path, to.symbol);
  if (!toResolution.success) {
    return toResolution.error;
  }

  const fromId = fromResolution.nodeId;
  const toId = toResolution.nodeId;
  const fromFilePathWasResolved = fromResolution.filePathWasResolved ?? false;
  const toFilePathWasResolved = toResolution.filePathWasResolved ?? false;

  // Collect resolution messages
  const resolutionMessages: string[] = [];
  if (fromResolution.message) {
    resolutionMessages.push(fromResolution.message);
  }
  if (toResolution.message) {
    resolutionMessages.push(toResolution.message);
  }
  const resolutionPrefix = resolutionMessages.length > 0
    ? resolutionMessages.join("\n") + "\n\n"
    : "";

  // Same-node check
  if (fromId === toId) {
    return resolutionPrefix + "Invalid query: source and target are the same symbol.";
  }

  // Try forward path (from → to)
  let paths = queryPath(db, fromId, toId, { maxPaths: 1 });

  // If no path, try reverse (bidirectional search)
  if (paths.length === 0) {
    paths = queryPath(db, toId, fromId, { maxPaths: 1 });
  }

  if (paths.length === 0) {
    return resolutionPrefix + "No path found.";
  }

  const path = paths[0];
  if (!path) {
    return resolutionPrefix + "No path found.";
  }

  // Convert path edges to EdgeWithCallSites format
  const graphEdges: EdgeWithCallSites[] = path.edges.map((e) => ({
    source: e.source,
    target: e.target,
    type: e.type,
    callSites: e.callSites,
  }));

  // Get intermediate node IDs
  // When file_path was auto-resolved, include that endpoint so agent sees which file was resolved
  const excludeIds = new Set<string>();
  if (!fromFilePathWasResolved) {
    excludeIds.add(fromId);
  }
  if (!toFilePathWasResolved) {
    excludeIds.add(toId);
  }

  const nodeIdsToQuery = path.nodes.filter((id) => !excludeIds.has(id));

  // Query node information
  const nodes = queryNodeInfos(db, nodeIdsToQuery);

  // Enrich with call sites BEFORE loading snippets
  // (so extractSnippet can truncate around call sites)
  const enrichedNodes = enrichNodesWithCallSites(nodes, graphEdges);

  // Load snippets (I/O boundary)
  const nodesWithSnippets = loadNodeSnippets(
    enrichedNodes,
    projectRoot,
    nodes.length,
  );

  // Format output (pure)
  const output = formatToolOutput({
    edges: graphEdges,
    nodes: nodesWithSnippets,
    excludeNodeIds: excludeIds,
    maxNodes: options.maxNodes,
  });

  // Prepend resolution messages if any symbols were auto-resolved
  return resolutionPrefix + output;
}
