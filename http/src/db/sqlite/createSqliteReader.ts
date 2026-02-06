import { EDGE_TYPES, type EdgeType, type NodeType } from "@ts-graph/shared";
import type Database from "better-sqlite3";
import type { DbReader, PathResult } from "../DbReader.js";
import type { CallSiteRange, Edge, Node, TraversalOptions } from "../Types.js";

/** Maximum traversal depth for recursive queries */
const DEFAULT_MAX_DEPTH = 100;

/** Default number of paths to return */
const DEFAULT_MAX_PATHS = 3;

/**
 * Raw node row from SQLite.
 */
interface NodeRow {
  id: string;
  type: string;
  name: string;
  package: string;
  file_path: string;
  start_line: number;
  end_line: number;
  exported: number;
  properties: string;
  content_hash: string;
  snippet: string;
}

/**
 * Raw edge row from SQLite.
 */
interface EdgeRow {
  source: string;
  target: string;
  type: string;
  call_count: number | null;
  call_sites: string | null;
  context: string | null;
  reference_context: string | null;
}

/**
 * Convert a database row to a Node.
 */
const rowToNode = (row: NodeRow): Node => {
  const properties = JSON.parse(row.properties) as Record<string, unknown>;

  const baseNode = {
    id: row.id,
    type: row.type as NodeType,
    name: row.name,
    package: row.package,
    filePath: row.file_path,
    startLine: row.start_line,
    endLine: row.end_line,
    exported: row.exported === 1,
    contentHash: row.content_hash,
    snippet: row.snippet,
  };

  return { ...baseNode, ...properties } as Node;
};

/**
 * Convert a database row to an Edge.
 */
const rowToEdge = (row: EdgeRow): Edge => {
  const edge: Edge = {
    source: row.source,
    target: row.target,
    type: row.type as EdgeType,
  };

  if (row.call_count != null) {
    edge.callCount = row.call_count;
  }
  if (row.call_sites != null) {
    edge.callSites = JSON.parse(row.call_sites) as CallSiteRange[];
  }
  if (row.context != null) {
    edge.context = row.context as Edge["context"];
  }
  if (row.reference_context != null) {
    edge.referenceContext = row.reference_context as Edge["referenceContext"];
  }

  return edge;
};

/**
 * Create a DbReader implementation backed by SQLite.
 *
 * @example
 * const reader = createSqliteReader(db);
 * const deps = reader.queryDependencies("src/api.ts:handleRequest");
 */
export const createSqliteReader = (db: Database.Database): DbReader => {
  return {
    queryDependencies(nodeId: string, options?: TraversalOptions): Edge[] {
      const edgeTypes = options?.edgeTypes ?? EDGE_TYPES;
      const maxDepth = options?.maxDepth ?? DEFAULT_MAX_DEPTH;
      const edgeTypesPlaceholder = edgeTypes.map(() => "?").join(", ");

      const sql = `
        WITH RECURSIVE deps(id, depth) AS (
          SELECT target, 1 FROM edges
          WHERE source = ? AND type IN (${edgeTypesPlaceholder})
          UNION
          SELECT e.target, d.depth + 1 FROM edges e
          JOIN deps d ON e.source = d.id
          WHERE e.type IN (${edgeTypesPlaceholder}) AND d.depth < ?
        )
        SELECT DISTINCT e.source, e.target, e.type, e.call_count, e.call_sites,
               e.context, e.reference_context
        FROM edges e
        WHERE (e.source = ? OR e.source IN (SELECT id FROM deps))
          AND e.target IN (SELECT id FROM deps)
          AND e.type IN (${edgeTypesPlaceholder})
      `;

      const params = [
        nodeId,
        ...edgeTypes,
        ...edgeTypes,
        maxDepth,
        nodeId,
        ...edgeTypes,
      ];

      const rows = db.prepare<unknown[], EdgeRow>(sql).all(...params);
      return rows.map(rowToEdge);
    },

    queryDependents(nodeId: string, options?: TraversalOptions): Edge[] {
      const edgeTypes = options?.edgeTypes ?? EDGE_TYPES;
      const maxDepth = options?.maxDepth ?? DEFAULT_MAX_DEPTH;
      const edgeTypesPlaceholder = edgeTypes.map(() => "?").join(", ");

      const sql = `
        WITH RECURSIVE callers(id, depth) AS (
          SELECT source, 1 FROM edges
          WHERE target = ? AND type IN (${edgeTypesPlaceholder})
          UNION
          SELECT e.source, c.depth + 1 FROM edges e
          JOIN callers c ON e.target = c.id
          WHERE e.type IN (${edgeTypesPlaceholder}) AND c.depth < ?
        )
        SELECT DISTINCT e.source, e.target, e.type, e.call_count, e.call_sites,
               e.context, e.reference_context
        FROM edges e
        WHERE e.source IN (SELECT id FROM callers)
          AND (e.target = ? OR e.target IN (SELECT id FROM callers))
          AND e.type IN (${edgeTypesPlaceholder})
      `;

      const params = [
        nodeId,
        ...edgeTypes,
        ...edgeTypes,
        maxDepth,
        nodeId,
        ...edgeTypes,
      ];

      const rows = db.prepare<unknown[], EdgeRow>(sql).all(...params);
      return rows.map(rowToEdge);
    },

    queryPaths(
      fromId: string,
      toId: string,
      options?: TraversalOptions,
    ): PathResult[] {
      const maxDepth = options?.maxDepth ?? DEFAULT_MAX_DEPTH;
      const maxPaths = DEFAULT_MAX_PATHS;

      const sql = `
        WITH RECURSIVE path_search(node_id, path_nodes, path_length) AS (
          SELECT ?, json_array(?), 0

          UNION ALL

          SELECT
            e.target,
            json_insert(p.path_nodes, '$[#]', e.target),
            p.path_length + 1
          FROM edges e
          JOIN path_search p ON e.source = p.node_id
          WHERE p.path_length < ?
            AND json_array_length(p.path_nodes) <= ?
            AND NOT EXISTS (
              SELECT 1 FROM json_each(p.path_nodes)
              WHERE json_each.value = e.target
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
        .all(fromId, fromId, maxDepth, maxDepth, toId, maxPaths) as Array<{
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
          if (from === undefined || to === undefined) {
            continue;
          }
          const edgeRow = db
            .prepare<[string, string], EdgeRow>(
              `SELECT source, target, type, call_count, call_sites,
                      context, reference_context
               FROM edges WHERE source = ? AND target = ? LIMIT 1`,
            )
            .get(from, to);
          if (edgeRow) {
            edges.push(rowToEdge(edgeRow));
          }
        }

        return { nodes, edges };
      });
    },

    getNode(id: string): Node | null {
      const row = db
        .prepare<[string], NodeRow>(
          `SELECT id, type, name, package, file_path, start_line, end_line, exported, properties, content_hash, snippet
           FROM nodes WHERE id = ?`,
        )
        .get(id);

      return row ? rowToNode(row) : null;
    },

    getNodes(ids: string[]): Node[] {
      if (ids.length === 0) {
        return [];
      }

      const placeholders = ids.map(() => "?").join(", ");
      const rows = db
        .prepare<unknown[], NodeRow>(
          `SELECT id, type, name, package, file_path, start_line, end_line, exported, properties, content_hash, snippet
           FROM nodes WHERE id IN (${placeholders})`,
        )
        .all(...ids);

      return rows.map(rowToNode);
    },

    findNodesBySymbol(symbol: string, filePath?: string): Node[] {
      let sql: string;
      let params: string[];

      if (filePath) {
        // Scoped to file: exact ID match or name match within file
        sql = `
          SELECT id, type, name, package, file_path, start_line, end_line, exported, properties, content_hash, snippet
          FROM nodes
          WHERE (id = ? OR (LOWER(name) = LOWER(?) AND file_path = ?))
          LIMIT 10
        `;
        params = [`${filePath}:${symbol}`, symbol, filePath];
      } else {
        // Search across all files:
        // 1. Exact name match
        // 2. Method match (name ends with .symbol)
        // 3. Symbol path match (extract from ID)
        sql = `
          SELECT id, type, name, package, file_path, start_line, end_line, exported, properties, content_hash, snippet
          FROM nodes
          WHERE (LOWER(name) = LOWER(?)
                 OR LOWER(name) LIKE '%.' || LOWER(?)
                 OR LOWER(SUBSTR(id, INSTR(id, ':') + 1)) = LOWER(?))
          LIMIT 10
        `;
        params = [symbol, symbol, symbol];
      }

      const rows = db.prepare<unknown[], NodeRow>(sql).all(...params);
      return rows.map(rowToNode);
    },
  };
};
