import type Database from "better-sqlite3";
import type { DbWriter } from "../DbWriter.js";
import type { Edge, Node } from "../Types.js";
import { dropAllTables, initializeSchema } from "./sqliteSchema.utils.js";

/**
 * Extract type-specific properties from a node (everything not in BaseNode).
 */
const extractNodeProperties = (node: Node): Record<string, unknown> => {
  const {
    id: _id,
    type: _type,
    name: _name,
    package: _package,
    filePath: _filePath,
    startLine: _startLine,
    endLine: _endLine,
    exported: _exported,
    ...properties
  } = node;
  return properties;
};

/**
 * Create a DbWriter implementation backed by SQLite.
 *
 * @param db - better-sqlite3 database instance
 * @returns DbWriter implementation
 */
export const createSqliteWriter = (db: Database.Database): DbWriter => {
  // Prepared statements for upsert operations
  const upsertNodeStmt = db.prepare(`
    INSERT INTO nodes (id, type, name, package, file_path, start_line, end_line, exported, properties)
    VALUES (@id, @type, @name, @package, @filePath, @startLine, @endLine, @exported, @properties)
    ON CONFLICT(id) DO UPDATE SET
      type = excluded.type,
      name = excluded.name,
      package = excluded.package,
      file_path = excluded.file_path,
      start_line = excluded.start_line,
      end_line = excluded.end_line,
      exported = excluded.exported,
      properties = excluded.properties
  `);

  const upsertEdgeStmt = db.prepare(`
    INSERT INTO edges (source, target, type, call_count, call_sites, is_type_only, imported_symbols, context, reference_context)
    VALUES (@source, @target, @type, @callCount, @callSites, @isTypeOnly, @importedSymbols, @context, @referenceContext)
    ON CONFLICT(source, target, type) DO UPDATE SET
      call_count = excluded.call_count,
      call_sites = excluded.call_sites,
      is_type_only = excluded.is_type_only,
      imported_symbols = excluded.imported_symbols,
      context = excluded.context,
      reference_context = excluded.reference_context
  `);

  const deleteNodesByFileStmt = db.prepare(`
    DELETE FROM nodes WHERE file_path = ?
  `);

  // Delete edges where source belongs to the file (outgoing edges only)
  // Node IDs: file node = "path", symbol nodes = "path:symbol"
  // Note: We don't delete incoming edges (where target belongs to file) because:
  // 1. Those edges are "owned" by the source file, not this file
  // 2. When processing multiple files in a batch, deleting incoming edges would
  //    remove edges that were just added by another file in the same batch
  // 3. Dangling edges (pointing to non-existent targets) are harmless since
  //    queries use JOINs which automatically filter them out
  const deleteEdgesByFileStmt = db.prepare(`
    DELETE FROM edges
    WHERE source = @filePath OR source LIKE @filePrefix
  `);

  // Transaction wrappers for batch operations
  const addNodesTransaction = db.transaction((nodes: Node[]) => {
    for (const node of nodes) {
      const properties = extractNodeProperties(node);
      upsertNodeStmt.run({
        id: node.id,
        type: node.type,
        name: node.name,
        package: node.package,
        filePath: node.filePath,
        startLine: node.startLine,
        endLine: node.endLine,
        exported: node.exported ? 1 : 0,
        properties: JSON.stringify(properties),
      });
    }
  });

  const addEdgesTransaction = db.transaction((edges: Edge[]) => {
    for (const edge of edges) {
      upsertEdgeStmt.run({
        source: edge.source,
        target: edge.target,
        type: edge.type,
        callCount: edge.callCount ?? null,
        callSites: edge.callSites ? JSON.stringify(edge.callSites) : null,
        isTypeOnly: edge.isTypeOnly != null ? (edge.isTypeOnly ? 1 : 0) : null,
        importedSymbols: edge.importedSymbols
          ? JSON.stringify(edge.importedSymbols)
          : null,
        context: edge.context ?? null,
        referenceContext: edge.referenceContext ?? null,
      });
    }
  });

  return {
    async addNodes(nodes: Node[]): Promise<void> {
      addNodesTransaction(nodes);
    },

    async addEdges(edges: Edge[]): Promise<void> {
      addEdgesTransaction(edges);
    },

    async removeFileNodes(filePath: string): Promise<void> {
      // Explicitly delete edges first (no FK cascade)
      deleteEdgesByFileStmt.run({
        filePath,
        filePrefix: `${filePath}:%`,
      });
      // Then delete nodes
      deleteNodesByFileStmt.run(filePath);
    },

    async clearAll(): Promise<void> {
      dropAllTables(db);
      initializeSchema(db);
    },
  };
};
