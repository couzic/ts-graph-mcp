import type Database from "better-sqlite3";
import type { DbReader } from "../DbReader.js";
import type {
	Edge,
	EdgeType,
	NeighborOptions,
	Node,
	NodeType,
	Path,
	SearchFilters,
	Subgraph,
	TraversalOptions,
} from "../Types.js";

interface NodeRow {
	id: string;
	type: string;
	name: string;
	module: string;
	package: string;
	file_path: string;
	start_line: number;
	end_line: number;
	exported: number;
	properties: string;
}

interface EdgeRow {
	source: string;
	target: string;
	type: string;
	call_count: number | null;
	is_type_only: number | null;
	imported_symbols: string | null;
	context: string | null;
}

const rowToNode = (row: NodeRow): Node => {
	const properties = JSON.parse(row.properties) as Record<string, unknown>;
	return {
		id: row.id,
		type: row.type as NodeType,
		name: row.name,
		module: row.module,
		package: row.package,
		filePath: row.file_path,
		startLine: row.start_line,
		endLine: row.end_line,
		exported: row.exported === 1,
		...properties,
	} as Node;
};

const rowToEdge = (row: EdgeRow): Edge => {
	const edge: Edge = {
		source: row.source,
		target: row.target,
		type: row.type as EdgeType,
	};
	if (row.call_count != null) edge.callCount = row.call_count;
	if (row.is_type_only != null) edge.isTypeOnly = row.is_type_only === 1;
	if (row.imported_symbols != null)
		edge.importedSymbols = JSON.parse(row.imported_symbols) as string[];
	if (row.context != null) edge.context = row.context as Edge["context"];
	return edge;
};

const globToSqlite = (pattern: string): string => {
	// SQLite GLOB uses * and ?, same as our pattern spec
	return pattern;
};

interface FilterResult {
	sql: string;
	params: string[];
}

const buildEdgeTypeFilter = (edgeTypes?: EdgeType[]): FilterResult => {
	if (!edgeTypes || edgeTypes.length === 0) {
		return { sql: "", params: [] };
	}
	const placeholders = edgeTypes.map(() => "?").join(", ");
	return {
		sql: `AND e.type IN (${placeholders})`,
		params: edgeTypes,
	};
};

const buildModuleFilter = (moduleFilter?: string[]): FilterResult => {
	if (!moduleFilter || moduleFilter.length === 0) {
		return { sql: "", params: [] };
	}
	const placeholders = moduleFilter.map(() => "?").join(", ");
	return {
		sql: `AND n.module IN (${placeholders})`,
		params: moduleFilter,
	};
};

/**
 * Create a DbReader implementation backed by SQLite.
 *
 * @param db - better-sqlite3 database instance
 * @returns DbReader implementation
 */
export const createSqliteReader = (db: Database.Database): DbReader => {
	const getNodeByIdStmt = db.prepare<[string], NodeRow>(`
    SELECT * FROM nodes WHERE id = ?
  `);

	const getFileNodesStmt = db.prepare<[string], NodeRow>(`
    SELECT * FROM nodes WHERE file_path = ?
  `);

	return {
		async getCallersOf(
			targetId: string,
			options?: TraversalOptions,
		): Promise<Node[]> {
			const maxDepth = options?.maxDepth ?? 100;
			const moduleFilter = buildModuleFilter(options?.moduleFilter);

			const sql = `
        WITH RECURSIVE callers(id, depth) AS (
          SELECT source, 1
          FROM edges e
          WHERE e.target = ? AND e.type = 'CALLS'

          UNION

          SELECT e.source, c.depth + 1
          FROM edges e
          JOIN callers c ON e.target = c.id
          WHERE e.type = 'CALLS' AND c.depth < ?
        )
        SELECT DISTINCT n.*
        FROM callers c
        JOIN nodes n ON n.id = c.id
        WHERE 1=1 ${moduleFilter.sql}
      `;

			const rows = db
				.prepare(sql)
				.all(targetId, maxDepth, ...moduleFilter.params) as NodeRow[];
			return rows.map(rowToNode);
		},

		async getCalleesOf(
			sourceId: string,
			options?: TraversalOptions,
		): Promise<Node[]> {
			const maxDepth = options?.maxDepth ?? 100;
			const moduleFilter = buildModuleFilter(options?.moduleFilter);

			const sql = `
        WITH RECURSIVE callees(id, depth) AS (
          SELECT target, 1
          FROM edges e
          WHERE e.source = ? AND e.type = 'CALLS'

          UNION

          SELECT e.target, c.depth + 1
          FROM edges e
          JOIN callees c ON e.source = c.id
          WHERE e.type = 'CALLS' AND c.depth < ?
        )
        SELECT DISTINCT n.*
        FROM callees c
        JOIN nodes n ON n.id = c.id
        WHERE 1=1 ${moduleFilter.sql}
      `;

			const rows = db
				.prepare(sql)
				.all(sourceId, maxDepth, ...moduleFilter.params) as NodeRow[];
			return rows.map(rowToNode);
		},

		async getTypeUsages(
			typeId: string,
			options?: TraversalOptions,
		): Promise<Node[]> {
			const maxDepth = options?.maxDepth ?? 1;
			const moduleFilter = buildModuleFilter(options?.moduleFilter);

			const sql = `
        WITH RECURSIVE usages(id, depth) AS (
          SELECT source, 1
          FROM edges e
          WHERE e.target = ? AND e.type = 'USES_TYPE'

          UNION

          SELECT e.source, u.depth + 1
          FROM edges e
          JOIN usages u ON e.target = u.id
          WHERE e.type = 'USES_TYPE' AND u.depth < ?
        )
        SELECT DISTINCT n.*
        FROM usages u
        JOIN nodes n ON n.id = u.id
        WHERE 1=1 ${moduleFilter.sql}
      `;

			const rows = db
				.prepare(sql)
				.all(typeId, maxDepth, ...moduleFilter.params) as NodeRow[];
			return rows.map(rowToNode);
		},

		async getImpactedBy(
			nodeId: string,
			options?: TraversalOptions,
		): Promise<Node[]> {
			const maxDepth = options?.maxDepth ?? 100;
			const edgeFilter = buildEdgeTypeFilter(options?.edgeTypes);
			const moduleFilter = buildModuleFilter(options?.moduleFilter);

			// Impact analysis: traverse incoming edges (what depends on this node?)
			const sql = `
        WITH RECURSIVE impacted(id, depth) AS (
          SELECT source, 1
          FROM edges e
          WHERE e.target = ? ${edgeFilter.sql}

          UNION

          SELECT e.source, i.depth + 1
          FROM edges e
          JOIN impacted i ON e.target = i.id
          WHERE i.depth < ? ${edgeFilter.sql}
        )
        SELECT DISTINCT n.*
        FROM impacted i
        JOIN nodes n ON n.id = i.id
        WHERE 1=1 ${moduleFilter.sql}
      `;

			// Note: edgeFilter params appear twice (once in base case, once in recursive case)
			const rows = db
				.prepare(sql)
				.all(
					nodeId,
					...edgeFilter.params,
					maxDepth,
					...edgeFilter.params,
					...moduleFilter.params,
				) as NodeRow[];
			return rows.map(rowToNode);
		},

		async getPathBetween(
			sourceId: string,
			targetId: string,
		): Promise<Path | null> {
			// BFS to find shortest path using recursive CTE with path tracking
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
          WHERE p.path_length < 20
            AND json_array_length(p.path_nodes) <= 20
            AND NOT EXISTS (
              SELECT 1 FROM json_each(p.path_nodes)
              WHERE json_each.value = e.target
            )
        )
        SELECT path_nodes, path_length
        FROM path_search
        WHERE node_id = ?
        ORDER BY path_length
        LIMIT 1
      `;

			const row = db.prepare(sql).get(sourceId, sourceId, targetId) as
				| { path_nodes: string; path_length: number }
				| undefined;

			if (!row) return null;

			const pathNodes = JSON.parse(row.path_nodes) as string[];

			// Fetch edges along the path
			const edges: Edge[] = [];
			for (let i = 0; i < pathNodes.length - 1; i++) {
				const from = pathNodes[i];
				const to = pathNodes[i + 1];
				if (from === undefined || to === undefined) continue;
				const edgeRow = db
					.prepare<[string, string], EdgeRow>(
						"SELECT * FROM edges WHERE source = ? AND target = ? LIMIT 1",
					)
					.get(from, to);
				if (edgeRow) {
					edges.push(rowToEdge(edgeRow));
				}
			}

			return {
				start: sourceId,
				end: targetId,
				nodes: pathNodes,
				edges,
				length: row.path_length,
			};
		},

		async searchNodes(
			pattern: string,
			filters?: SearchFilters,
		): Promise<Node[]> {
			const conditions: string[] = ["name GLOB ?"];
			const params: (string | number)[] = [globToSqlite(pattern)];

			if (filters?.nodeType) {
				const types = Array.isArray(filters.nodeType)
					? filters.nodeType
					: [filters.nodeType];
				conditions.push(`type IN (${types.map(() => "?").join(", ")})`);
				params.push(...types);
			}

			if (filters?.module) {
				const modules = Array.isArray(filters.module)
					? filters.module
					: [filters.module];
				conditions.push(`module IN (${modules.map(() => "?").join(", ")})`);
				params.push(...modules);
			}

			if (filters?.package) {
				const packages = Array.isArray(filters.package)
					? filters.package
					: [filters.package];
				conditions.push(`package IN (${packages.map(() => "?").join(", ")})`);
				params.push(...packages);
			}

			if (filters?.exported !== undefined) {
				conditions.push("exported = ?");
				params.push(filters.exported ? 1 : 0);
			}

			const sql = `SELECT * FROM nodes WHERE ${conditions.join(" AND ")}`;
			const rows = db.prepare(sql).all(...params) as NodeRow[];
			return rows.map(rowToNode);
		},

		async getNodeById(nodeId: string): Promise<Node | null> {
			const row = getNodeByIdStmt.get(nodeId);
			return row ? rowToNode(row) : null;
		},

		async getFileNodes(filePath: string): Promise<Node[]> {
			const rows = getFileNodesStmt.all(filePath) as NodeRow[];
			return rows.map(rowToNode);
		},

		async findNeighbors(
			centerId: string,
			options: NeighborOptions,
		): Promise<Subgraph> {
			const { distance, direction = "both", edgeTypes } = options;
			const edgeFilter = buildEdgeTypeFilter(edgeTypes);

			// Get center node first
			const centerRow = getNodeByIdStmt.get(centerId);
			if (!centerRow) {
				throw new Error(`Node not found: ${centerId}`);
			}
			const center = rowToNode(centerRow);

			// Build direction-specific CTEs
			let neighborsCte: string;
			if (direction === "outgoing") {
				neighborsCte = `
          WITH RECURSIVE neighbors(id, depth) AS (
            SELECT ?, 0

            UNION

            SELECT e.target, n.depth + 1
            FROM edges e
            JOIN neighbors n ON e.source = n.id
            WHERE n.depth < ? ${edgeFilter.sql}
          )
        `;
			} else if (direction === "incoming") {
				neighborsCte = `
          WITH RECURSIVE neighbors(id, depth) AS (
            SELECT ?, 0

            UNION

            SELECT e.source, n.depth + 1
            FROM edges e
            JOIN neighbors n ON e.target = n.id
            WHERE n.depth < ? ${edgeFilter.sql}
          )
        `;
			} else {
				// both directions
				neighborsCte = `
          WITH RECURSIVE neighbors(id, depth) AS (
            SELECT ?, 0

            UNION

            SELECT
              CASE WHEN e.source = n.id THEN e.target ELSE e.source END,
              n.depth + 1
            FROM edges e
            JOIN neighbors n ON e.source = n.id OR e.target = n.id
            WHERE n.depth < ? ${edgeFilter.sql}
          )
        `;
			}

			// Get all neighbor nodes
			const nodesSql = `
        ${neighborsCte}
        SELECT DISTINCT nd.*
        FROM neighbors nb
        JOIN nodes nd ON nd.id = nb.id
      `;
			const nodeRows = db
				.prepare(nodesSql)
				.all(centerId, distance, ...edgeFilter.params) as NodeRow[];
			const nodes = nodeRows.map(rowToNode);

			// Get node IDs for edge filtering
			const nodeIds = new Set(nodes.map((n) => n.id));

			// Get edges between neighbors
			const edgesSql = `
        SELECT e.*
        FROM edges e
        WHERE e.source IN (${[...nodeIds].map(() => "?").join(", ")})
          AND e.target IN (${[...nodeIds].map(() => "?").join(", ")})
          ${edgeFilter.sql}
      `;
			const edgeParams = [...nodeIds, ...nodeIds, ...edgeFilter.params];
			const edgeRows = db.prepare(edgesSql).all(...edgeParams) as EdgeRow[];
			const edges = edgeRows.map(rowToEdge);

			return { center, nodes, edges };
		},
	};
};
