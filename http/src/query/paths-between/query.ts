import type Database from "better-sqlite3";
import type { Edge } from "../../db/Types.js";
import type { EdgeRow } from "../shared/QueryTypes.js";
import { rowToEdge } from "../shared/rowToEdge.js";

/**
 * Path result from the query.
 */
export interface PathResult {
  /** Node IDs in order from source to target */
  nodes: string[];
  /** Edges connecting consecutive nodes */
  edges: Edge[];
}

/** Default maximum path length */
const DEFAULT_MAX_DEPTH = 20;

/** Default number of paths to return */
const DEFAULT_MAX_PATHS = 3;

/**
 * Query options for path finding.
 */
export interface QueryPathOptions {
  /** Maximum path length (default: 20) */
  maxDepth?: number;
  /** Maximum number of paths to return (default: 3) */
  maxPaths?: number;
}

/**
 * Query paths between two nodes using BFS.
 *
 * Uses recursive CTE with JSON array for path tracking and cycle detection.
 * Returns up to maxPaths shortest paths, ordered by length.
 *
 * @param db - Database connection
 * @param sourceId - Starting node ID
 * @param targetId - Target node ID
 * @param options - Query options (maxDepth, maxPaths)
 * @returns Array of path results (empty if no path exists)
 */
export function queryPath(
  db: Database.Database,
  sourceId: string,
  targetId: string,
  options: QueryPathOptions = {},
): PathResult[] {
  const maxDepth = options.maxDepth ?? DEFAULT_MAX_DEPTH;
  const maxPaths = options.maxPaths ?? DEFAULT_MAX_PATHS;

  /** @spec tool::query.bidirectional-implements-extends */
  const sql = `
		WITH RECURSIVE path_search(node_id, path_nodes, path_length) AS (
			SELECT ?, json_array(?), 0

			UNION ALL

			SELECT
				CASE WHEN e.source = p.node_id THEN e.target ELSE e.source END,
				json_insert(p.path_nodes, '$[#]',
					CASE WHEN e.source = p.node_id THEN e.target ELSE e.source END),
				p.path_length + 1
			FROM edges e
			JOIN path_search p ON
				e.source = p.node_id
				OR (e.target = p.node_id AND e.type IN ('IMPLEMENTS', 'EXTENDS'))
			WHERE p.path_length < ?
				AND json_array_length(p.path_nodes) <= ?
				AND NOT EXISTS (
					SELECT 1 FROM json_each(p.path_nodes)
					WHERE json_each.value = CASE WHEN e.source = p.node_id THEN e.target ELSE e.source END
				)
		)
		SELECT path_nodes, path_length
		FROM path_search
		WHERE node_id = ?
		ORDER BY path_length
		LIMIT ?
	`;

  const rows = db
    .prepare(sql)
    .all(sourceId, sourceId, maxDepth, maxDepth, targetId, maxPaths) as Array<{
    path_nodes: string;
    path_length: number;
  }>;

  return rows.map((row) => {
    const nodes = JSON.parse(row.path_nodes) as string[];

    // Fetch edges along the path
    const edges: Edge[] = [];
    for (let i = 0; i < nodes.length - 1; i++) {
      const from = nodes[i];
      const to = nodes[i + 1];
      if (from === undefined || to === undefined) { continue; }
      let edgeRow = db
        .prepare<[string, string], EdgeRow>(
          "SELECT * FROM edges WHERE source = ? AND target = ? LIMIT 1",
        )
        .get(from, to);
      // Try reverse direction for IMPLEMENTS/EXTENDS (bidirectional traversal)
      if (!edgeRow) {
        edgeRow = db
          .prepare<[string, string], EdgeRow>(
            "SELECT * FROM edges WHERE source = ? AND target = ? AND type IN ('IMPLEMENTS', 'EXTENDS') LIMIT 1",
          )
          .get(to, from);
      }
      if (edgeRow) {
        edges.push(rowToEdge(edgeRow));
      }
    }

    return { nodes, edges };
  });
}
