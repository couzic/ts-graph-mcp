import type Database from "better-sqlite3";
import {
  type EdgeWithCallSites,
  enrichNodesWithCallSites,
  formatToolOutput,
} from "../shared/formatToolOutput.js";
import { loadNodeSnippets } from "../shared/loadNodeSnippets.js";
import { queryNodeInfos } from "../shared/queryNodeInfos.js";
import { queryPath } from "./query.js";

export interface SymbolRef {
  file_path: string;
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
): string {
  const fromId = `${from.file_path}:${from.symbol}`;
  const toId = `${to.file_path}:${to.symbol}`;

  // Same-node check
  if (fromId === toId) {
    return "Invalid query: source and target are the same symbol.";
  }

  // Validate both exist
  const fromExists = db
    .prepare<[string], { found: 1 }>(
      "SELECT 1 as found FROM nodes WHERE id = ?",
    )
    .get(fromId);

  if (!fromExists) {
    return `Symbol '${from.symbol}' not found at ${from.file_path}`;
  }

  const toExists = db
    .prepare<[string], { found: 1 }>(
      "SELECT 1 as found FROM nodes WHERE id = ?",
    )
    .get(toId);

  if (!toExists) {
    return `Symbol '${to.symbol}' not found at ${to.file_path}`;
  }

  // Try forward path (from → to)
  let paths = queryPath(db, fromId, toId, { maxPaths: 1 });

  // If no path, try reverse (bidirectional search)
  if (paths.length === 0) {
    paths = queryPath(db, toId, fromId, { maxPaths: 1 });
  }

  if (paths.length === 0) {
    return "No path found.";
  }

  const path = paths[0];
  if (!path) {
    return "No path found.";
  }

  // Convert path edges to EdgeWithCallSites format
  const graphEdges: EdgeWithCallSites[] = path.edges.map((e) => ({
    source: e.source,
    target: e.target,
    type: e.type,
    callSites: e.callSites,
  }));

  // Get intermediate node IDs (excluding from/to)
  const intermediateIds = path.nodes.filter(
    (id) => id !== fromId && id !== toId,
  );

  // Query node information for intermediates
  const nodes = queryNodeInfos(db, intermediateIds);

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
  return formatToolOutput({
    edges: graphEdges,
    nodes: nodesWithSnippets,
    excludeNodeIds: new Set([fromId, toId]),
  });
}
