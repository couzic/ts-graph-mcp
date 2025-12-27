import type Database from "better-sqlite3";
import type { CallSiteRange, Edge } from "../../db/Types.js";
import { queryPath } from "../find-paths/query.js";
import { buildDisplayNames, formatGraph } from "../shared/formatGraph.js";
import { formatNodes } from "../shared/formatNodes.js";
import type { GraphEdge, NodeInfo } from "../shared/GraphTypes.js";

export interface SymbolRef {
  file_path: string;
  symbol: string;
}

interface NodeRow {
  id: string;
  name: string;
  file_path: string;
  start_line: number;
  end_line: number;
}

/**
 * Query node information for a list of node IDs.
 */
const queryNodeInfos = (
  db: Database.Database,
  nodeIds: string[],
): NodeInfo[] => {
  if (nodeIds.length === 0) return [];

  const placeholders = nodeIds.map(() => "?").join(", ");
  const sql = `
		SELECT id, name, file_path, start_line, end_line
		FROM nodes
		WHERE id IN (${placeholders})
	`;

  const rows = db.prepare<unknown[], NodeRow>(sql).all(...nodeIds);

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    filePath: row.file_path,
    startLine: row.start_line,
    endLine: row.end_line,
  }));
};

/**
 * Build a map of node ID → call sites from path edges.
 * For paths, each edge's call sites belong to the source node.
 */
const buildCallSitesMap = (edges: Edge[]): Map<string, CallSiteRange[]> => {
  const callSitesByNode = new Map<string, CallSiteRange[]>();

  for (const edge of edges) {
    if (edge.callSites && edge.callSites.length > 0) {
      const existing = callSitesByNode.get(edge.source) ?? [];
      existing.push(...edge.callSites);
      callSitesByNode.set(edge.source, existing);
    }
  }

  return callSitesByNode;
};

/**
 * Enrich nodes with call site information.
 */
const enrichNodesWithCallSites = (
  nodes: NodeInfo[],
  callSitesMap: Map<string, CallSiteRange[]>,
): NodeInfo[] => {
  return nodes.map((node) => ({
    ...node,
    callSites: callSitesMap.get(node.id),
  }));
};

/**
 * Find how two symbols connect through the code graph.
 *
 * "How does A reach B?"
 *
 * Bidirectional search: Finds the path regardless of which direction you specify.
 * The arrows in the output show the actual direction.
 *
 * @param db - Database connection
 * @param projectRoot - Project root for snippet extraction
 * @param from - Source symbol
 * @param to - Target symbol
 * @returns Formatted output (Graph + Nodes sections)
 */
export function pathsBetween(
  db: Database.Database,
  projectRoot: string,
  from: SymbolRef,
  to: SymbolRef,
): string {
  // 1. Build node IDs
  const fromId = `${from.file_path}:${from.symbol}`;
  const toId = `${to.file_path}:${to.symbol}`;

  // 2. Same-node check
  if (fromId === toId) {
    return "Invalid query: source and target are the same symbol.";
  }

  // 3. Validate both exist
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

  // 4. Try forward path (from → to)
  let paths = queryPath(db, fromId, toId, { maxPaths: 1 });

  // 5. If no path, try reverse (bidirectional search)
  if (paths.length === 0) {
    paths = queryPath(db, toId, fromId, { maxPaths: 1 });
  }

  // 6. No path in either direction
  if (paths.length === 0) {
    return "No path found.";
  }

  // 7. Extract the path
  const path = paths[0];
  if (!path) {
    return "No path found.";
  }

  // Convert path edges to GraphEdge format for formatGraph
  const graphEdges: GraphEdge[] = path.edges.map((e) => ({
    source: e.source,
    target: e.target,
    type: e.type,
  }));

  // 8. Collect intermediate node IDs (excluding from/to)
  const intermediateIds = path.nodes.filter(
    (id) => id !== fromId && id !== toId,
  );

  // 9. Query node information for intermediates
  const nodes = queryNodeInfos(db, intermediateIds);

  // 10. Build call sites map and enrich nodes
  const callSitesMap = buildCallSitesMap(path.edges);
  const enrichedNodes = enrichNodesWithCallSites(nodes, callSitesMap);

  // 11. Build display names (include from/to for graph rendering)
  const allNodeIds = path.nodes;
  const displayNames = buildDisplayNames(allNodeIds);

  // 12. Format output
  const { text: graphSection, nodeOrder } = formatGraph(graphEdges);
  const nodesResult = formatNodes(
    enrichedNodes,
    displayNames,
    projectRoot,
    new Set([fromId, toId]),
    nodeOrder,
  );

  // Handle case where there are no intermediate nodes
  if (nodesResult.text.trim() === "") {
    return `## Graph\n\n${graphSection}`;
  }

  // Build final output with optional message
  let output = `## Graph\n\n${graphSection}\n\n## Nodes\n\n${nodesResult.text}`;
  if (nodesResult.message) {
    output += `\n${nodesResult.message}`;
  }

  return output;
}
