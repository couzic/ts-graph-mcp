import { EDGE_TYPES } from "@ts-graph/shared";
import type Database from "better-sqlite3";
import {
  type EdgeRowWithCallSites,
  type GraphEdgeWithCallSites,
  parseEdgeRows,
} from "../shared/parseEdgeRows.js";

interface ConnectSeedsOptions {
  maxDepth?: number;
}

const DEFAULT_MAX_DEPTH = 4;

/**
 * Find paths connecting seed nodes through the graph.
 * Uses multi-source BFS from all seeds simultaneously.
 * Nodes reachable from 2+ different seeds are "meeting points" —
 * all edges along paths to meeting points form the connected subgraph.
 *
 * @example
 * // Seeds {A, B} with graph A → X → B returns edges [A→X, X→B]
 * connectSeeds(db, ["src/a.ts:fnA", "src/b.ts:fnB"])
 */
export const connectSeeds = (
  db: Database.Database,
  seedNodeIds: string[],
  options?: ConnectSeedsOptions,
): GraphEdgeWithCallSites[] => {
  if (seedNodeIds.length < 2) {
    return [];
  }

  const maxDepth = options?.maxDepth ?? DEFAULT_MAX_DEPTH;

  // Step 1: Multi-source BFS from all seeds, tracking paths
  const rows = multiSourceBFS(db, seedNodeIds, maxDepth);

  // Step 2: Find meeting points (nodes reachable from 2+ different seeds)
  const seedsByNode = new Map<string, Set<string>>();
  for (const row of rows) {
    const seeds = seedsByNode.get(row.node_id) ?? new Set();
    seeds.add(row.seed_id);
    seedsByNode.set(row.node_id, seeds);
  }

  const meetingPoints = new Set<string>();
  for (const [nodeId, seeds] of seedsByNode) {
    if (seeds.size >= 2) {
      meetingPoints.add(nodeId);
    }
  }

  if (meetingPoints.size === 0) {
    return [];
  }

  // Step 3: Collect all node IDs on paths leading to meeting points
  const pathNodeIds = new Set<string>();
  for (const row of rows) {
    if (meetingPoints.has(row.node_id)) {
      const pathNodes = JSON.parse(row.path) as string[];
      for (const nodeId of pathNodes) {
        pathNodeIds.add(nodeId);
      }
    }
  }

  if (pathNodeIds.size < 2) {
    return [];
  }

  // Step 4: Query edges between all path nodes
  const nodeIds = Array.from(pathNodeIds);
  const placeholders = nodeIds.map(() => "?").join(", ");
  const edgeTypesPlaceholder = EDGE_TYPES.map(() => "?").join(", ");

  const edgeSql = `
    SELECT source, target, type, call_sites FROM edges
    WHERE source IN (${placeholders})
      AND target IN (${placeholders})
      AND type IN (${edgeTypesPlaceholder})
  `;

  const params = [...nodeIds, ...nodeIds, ...EDGE_TYPES];
  const edgeRows = db
    .prepare<unknown[], EdgeRowWithCallSites>(edgeSql)
    .all(...params);
  return parseEdgeRows(edgeRows);
};

interface BFSRow {
  node_id: string;
  seed_id: string;
  depth: number;
  path: string;
}

const multiSourceBFS = (
  db: Database.Database,
  seedNodeIds: string[],
  maxDepth: number,
): BFSRow[] => {
  const baseCases = seedNodeIds
    .map(() => "SELECT ?, ?, 0, json_array(?)")
    .join(" UNION ALL ");

  const edgeTypesPlaceholder = EDGE_TYPES.map(() => "?").join(", ");

  const sql = `
    WITH RECURSIVE expansion(node_id, seed_id, depth, path) AS (
      ${baseCases}
      UNION ALL
      SELECT e.target, x.seed_id, x.depth + 1,
             json_insert(x.path, '$[#]', e.target)
      FROM edges e
      JOIN expansion x ON e.source = x.node_id
      WHERE x.depth < ?
        AND e.type IN (${edgeTypesPlaceholder})
        AND NOT EXISTS (
          SELECT 1 FROM json_each(x.path)
          WHERE json_each.value = e.target
        )
    )
    SELECT node_id, seed_id, depth, path FROM expansion
  `;

  // 3 params per seed (node_id, seed_id, json_array arg)
  const baseParams = seedNodeIds.flatMap((id) => [id, id, id]);
  const params = [...baseParams, maxDepth, ...EDGE_TYPES];

  return db.prepare<unknown[], BFSRow>(sql).all(...params);
};
