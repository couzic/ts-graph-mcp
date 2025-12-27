import type Database from "better-sqlite3";
import type { CallSiteRange } from "../../db/Types.js";
import { buildDisplayNames, formatGraph } from "../shared/formatGraph.js";
import { formatNodes } from "../shared/formatNodes.js";
import type { NodeInfo } from "../shared/GraphTypes.js";

/** Edge types to traverse */
const EDGE_TYPES = ["CALLS", "REFERENCES", "EXTENDS", "IMPLEMENTS"];

/** Maximum traversal depth */
const MAX_DEPTH = 100;

interface EdgeRowWithCallSites {
  source: string;
  target: string;
  type: string;
  call_sites: string | null;
}

interface NodeRow {
  id: string;
  name: string;
  file_path: string;
  start_line: number;
  end_line: number;
}

interface GraphEdgeWithCallSites {
  source: string;
  target: string;
  type: string;
  callSites?: CallSiteRange[];
}

/**
 * Query all reverse dependencies (callers/dependents) of a target node.
 * Returns all edges in the reachable subgraph with call site information.
 */
const queryDependentEdges = (
  db: Database.Database,
  targetId: string,
): GraphEdgeWithCallSites[] => {
  const edgeTypesPlaceholder = EDGE_TYPES.map(() => "?").join(", ");

  // Recursive CTE to find all callers (reverse traversal)
  const sql = `
		WITH RECURSIVE callers(id, depth) AS (
			SELECT source, 1 FROM edges
			WHERE target = ? AND type IN (${edgeTypesPlaceholder})
			UNION
			SELECT e.source, c.depth + 1 FROM edges e
			JOIN callers c ON e.target = c.id
			WHERE e.type IN (${edgeTypesPlaceholder}) AND c.depth < ?
		)
		SELECT DISTINCT e.source, e.target, e.type, e.call_sites
		FROM edges e
		WHERE e.source IN (SELECT id FROM callers)
		  AND (e.target = ? OR e.target IN (SELECT id FROM callers))
		  AND e.type IN (${edgeTypesPlaceholder})
	`;

  const params = [
    targetId,
    ...EDGE_TYPES, // First IN clause
    ...EDGE_TYPES, // Second IN clause (in recursive part)
    MAX_DEPTH,
    targetId,
    ...EDGE_TYPES, // Third IN clause
  ];

  const rows = db.prepare<unknown[], EdgeRowWithCallSites>(sql).all(...params);

  return rows.map((row) => ({
    source: row.source,
    target: row.target,
    type: row.type,
    callSites: row.call_sites ? JSON.parse(row.call_sites) : undefined,
  }));
};

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
 * Build a map of node ID → call sites from edges.
 * For dependents, the call sites are in the source (caller) nodes.
 */
const buildCallSitesMap = (
  edges: GraphEdgeWithCallSites[],
): Map<string, CallSiteRange[]> => {
  const callSitesByNode = new Map<string, CallSiteRange[]>();

  for (const edge of edges) {
    if (edge.callSites && edge.callSites.length > 0) {
      // For dependents, call sites belong to the SOURCE (caller)
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
 * Find all code that depends on a symbol (reverse dependencies).
 *
 * "Who depends on this symbol?"
 *
 * @param db - Database connection
 * @param projectRoot - Project root for snippet extraction
 * @param filePath - File path of the symbol
 * @param symbol - Symbol name
 * @returns Formatted output (Graph + Nodes sections)
 */
export function dependentsOf(
  db: Database.Database,
  projectRoot: string,
  filePath: string,
  symbol: string,
): string {
  // 1. Construct node ID
  const nodeId = `${filePath}:${symbol}`;

  // 2. Validate symbol exists
  const exists = db
    .prepare<[string], { found: 1 }>(
      "SELECT 1 as found FROM nodes WHERE id = ?",
    )
    .get(nodeId);

  if (!exists) {
    return `Symbol '${symbol}' not found at ${filePath}`;
  }

  // 3. Query reverse dependencies with call sites
  const edges = queryDependentEdges(db, nodeId);

  // 4. Handle empty case
  if (edges.length === 0) {
    return "No dependents found.";
  }

  // 5. Collect all node IDs (excluding target)
  const nodeIds = new Set<string>();
  for (const edge of edges) {
    nodeIds.add(edge.source);
    nodeIds.add(edge.target);
  }
  nodeIds.delete(nodeId); // Exclude query input

  // 6. Query node information
  const nodes = queryNodeInfos(db, [...nodeIds]);

  // 7. Build call sites map and enrich nodes
  const callSitesMap = buildCallSitesMap(edges);
  const enrichedNodes = enrichNodesWithCallSites(nodes, callSitesMap);

  // 8. Build display names
  const allNodeIds = [nodeId, ...nodeIds];
  const displayNames = buildDisplayNames(allNodeIds);

  // 9. Format output
  const { text: graphSection, nodeOrder } = formatGraph(edges);
  const nodesResult = formatNodes(
    enrichedNodes,
    displayNames,
    projectRoot,
    new Set([nodeId]),
    nodeOrder,
  );

  // 10. Build final output with optional message
  let output = `## Graph\n\n${graphSection}\n\n## Nodes\n\n${nodesResult.text}`;
  if (nodesResult.message) {
    output += `\n${nodesResult.message}`;
  }

  return output;
}
