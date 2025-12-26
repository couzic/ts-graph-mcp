import type Database from "better-sqlite3";
import { buildDisplayNames, formatGraph } from "../shared/formatGraph.js";
import { formatNodes } from "../shared/formatNodes.js";
import type { GraphEdge, NodeInfo } from "../shared/GraphTypes.js";

/** Edge types to traverse */
const EDGE_TYPES = ["CALLS", "REFERENCES", "EXTENDS", "IMPLEMENTS"];

/** Maximum traversal depth */
const MAX_DEPTH = 100;

interface EdgeRow {
  source: string;
  target: string;
  type: string;
}

interface NodeRow {
  id: string;
  name: string;
  file_path: string;
  start_line: number;
  end_line: number;
}

/**
 * Query all reverse dependencies (callers/dependents) of a target node.
 * Returns all edges in the reachable subgraph.
 */
const queryDependentEdges = (
  db: Database.Database,
  targetId: string,
): GraphEdge[] => {
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
		SELECT DISTINCT e.source, e.target, e.type
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

  const rows = db.prepare<unknown[], EdgeRow>(sql).all(...params);

  return rows.map((row) => ({
    source: row.source,
    target: row.target,
    type: row.type,
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

  // 3. Query reverse dependencies
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

  // 7. Build display names
  const allNodeIds = [nodeId, ...nodeIds];
  const displayNames = buildDisplayNames(allNodeIds);

  // 8. Format output
  const graphSection = formatGraph(edges);
  const nodesSection = formatNodes(
    nodes,
    displayNames,
    projectRoot,
    new Set([nodeId]),
  );

  return `## Graph\n\n${graphSection}\n\n## Nodes\n\n${nodesSection}`;
}
