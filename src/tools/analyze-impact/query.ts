import type Database from "better-sqlite3";
import type { EdgeType, Node } from "../../db/Types.js";
import { type NodeRow, rowToNode } from "../shared/rowConverters.js";

export interface ImpactQueryOptions {
	maxDepth?: number;
}

/**
 * An impacted node with additional context about how it's connected.
 * Uses intersection type since Node is a union type.
 */
export type ImpactedNode = Node & {
	/** Minimum depth from target (1 = direct, 2+ = transitive) */
	depth: number;

	/** The edge type that first connected this node to the impact chain */
	entryEdgeType: EdgeType;
};

/**
 * Raw row returned from the impact query.
 */
interface ImpactedNodeRow extends NodeRow {
	min_depth: number;
	entry_edge_type: string;
}

/**
 * Query all nodes impacted by changes to the target node.
 * Uses recursive CTE to traverse incoming edges (what depends on this node?).
 *
 * Returns nodes with:
 * - depth: minimum distance from target (1 = direct dependent)
 * - entryEdgeType: the edge type that first connected this node
 *
 * @param db - Database connection
 * @param nodeId - Target node ID
 * @param options - Query options (maxDepth)
 * @returns Array of impacted nodes with depth and entry edge type
 */
export function queryImpactedNodes(
	db: Database.Database,
	nodeId: string,
	options?: ImpactQueryOptions,
): ImpactedNode[] {
	const maxDepth = options?.maxDepth ?? 100;

	// Impact analysis: traverse incoming edges (what depends on this node?)
	// Track both minimum depth and the edge type that first connected each node.
	//
	// The CTE tracks (id, depth, entry_edge_type) tuples. We use MIN(depth)
	// to get the shortest path, and a subquery to find the entry edge type
	// at that minimum depth.
	const sql = `
    WITH RECURSIVE impacted(id, depth, entry_edge_type) AS (
      -- Base case: direct dependents (depth 1)
      SELECT e.source, 1, e.type
      FROM edges e
      WHERE e.target = ?

      UNION

      -- Recursive case: transitive dependents
      SELECT e.source, i.depth + 1, e.type
      FROM edges e
      JOIN impacted i ON e.target = i.id
      WHERE i.depth < ?
    ),
    -- Aggregate to get minimum depth per node
    min_depths AS (
      SELECT id, MIN(depth) as min_depth
      FROM impacted
      GROUP BY id
    ),
    -- Get the entry edge type at minimum depth (pick first if multiple)
    with_entry_type AS (
      SELECT
        md.id,
        md.min_depth,
        (SELECT i.entry_edge_type
         FROM impacted i
         WHERE i.id = md.id AND i.depth = md.min_depth
         LIMIT 1) as entry_edge_type
      FROM min_depths md
    )
    SELECT n.*, wet.min_depth, wet.entry_edge_type
    FROM with_entry_type wet
    JOIN nodes n ON n.id = wet.id
    ORDER BY wet.min_depth, n.file_path, n.name
  `;

	const rows = db.prepare(sql).all(nodeId, maxDepth) as ImpactedNodeRow[];

	return rows.map((row) => ({
		...rowToNode(row),
		depth: row.min_depth,
		entryEdgeType: row.entry_edge_type as EdgeType,
	}));
}

/**
 * An impacted node with call sites (only for CALLS edges).
 */
export interface ImpactedNodeWithCallSites {
	node: ImpactedNode;
	/** Call sites for CALLS edges, empty array for other edge types */
	callSites: number[];
}

/**
 * Raw row returned from the impact query with call sites.
 */
interface ImpactedNodeRowWithCallSites extends NodeRow {
	min_depth: number;
	entry_edge_type: string;
	call_sites: string | null;
}

/**
 * Query impacted nodes with call sites for CALLS edges.
 * Used for snippet extraction when impact count is small.
 *
 * Only CALLS edges have call_sites stored. Other edge types (USES_TYPE, IMPORTS, etc.)
 * will have empty call_sites arrays.
 *
 * @param db - Database connection
 * @param nodeId - Target node ID
 * @param options - Query options (maxDepth)
 * @returns Array of impacted nodes with call sites
 */
export function queryImpactedNodesWithCallSites(
	db: Database.Database,
	nodeId: string,
	options?: ImpactQueryOptions,
): ImpactedNodeWithCallSites[] {
	const maxDepth = options?.maxDepth ?? 100;

	// Impact analysis with call sites for CALLS edges
	const sql = `
    WITH RECURSIVE impacted(id, depth, entry_edge_type) AS (
      -- Base case: direct dependents (depth 1)
      SELECT e.source, 1, e.type
      FROM edges e
      WHERE e.target = ?

      UNION

      -- Recursive case: transitive dependents
      SELECT e.source, i.depth + 1, e.type
      FROM edges e
      JOIN impacted i ON e.target = i.id
      WHERE i.depth < ?
    ),
    -- Aggregate to get minimum depth per node
    min_depths AS (
      SELECT id, MIN(depth) as min_depth
      FROM impacted
      GROUP BY id
    ),
    -- Get the entry edge type at minimum depth (pick first if multiple)
    with_entry_type AS (
      SELECT
        md.id,
        md.min_depth,
        (SELECT i.entry_edge_type
         FROM impacted i
         WHERE i.id = md.id AND i.depth = md.min_depth
         LIMIT 1) as entry_edge_type
      FROM min_depths md
    )
    SELECT n.*, wet.min_depth, wet.entry_edge_type, e.call_sites
    FROM with_entry_type wet
    JOIN nodes n ON n.id = wet.id
    LEFT JOIN edges e ON e.source = wet.id AND e.target = ? AND e.type = 'CALLS'
    ORDER BY wet.min_depth, n.file_path, n.name
  `;

	const rows = db
		.prepare(sql)
		.all(nodeId, maxDepth, nodeId) as ImpactedNodeRowWithCallSites[];

	return rows.map((row) => ({
		node: {
			...rowToNode(row),
			depth: row.min_depth,
			entryEdgeType: row.entry_edge_type as EdgeType,
		},
		callSites: row.call_sites ? JSON.parse(row.call_sites) : [],
	}));
}
