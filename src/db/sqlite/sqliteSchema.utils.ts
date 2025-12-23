import type Database from "better-sqlite3";

/**
 * SQLite schema for the code graph.
 *
 * Tables:
 * - nodes: All node types (discriminated by 'type' column)
 * - edges: All edge types with metadata
 *
 * Design notes:
 * - Node properties stored as JSON for flexibility across node types
 * - Edges have composite unique key (source, target, type)
 * - Indexes optimized for common queries (by file, by type, traversals)
 */

const NODES_TABLE = `
CREATE TABLE IF NOT EXISTS nodes (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  name TEXT NOT NULL,
  module TEXT NOT NULL,
  package TEXT NOT NULL,
  file_path TEXT NOT NULL,
  start_line INTEGER NOT NULL,
  end_line INTEGER NOT NULL,
  exported INTEGER NOT NULL DEFAULT 0,
  properties TEXT NOT NULL DEFAULT '{}'
)`;

const EDGES_TABLE = `
CREATE TABLE IF NOT EXISTS edges (
  source TEXT NOT NULL,
  target TEXT NOT NULL,
  type TEXT NOT NULL,
  call_count INTEGER,
  call_sites TEXT,
  is_type_only INTEGER,
  imported_symbols TEXT,
  context TEXT,
  PRIMARY KEY (source, target, type)
)`;

const INDEXES = [
	// Node indexes
	"CREATE INDEX IF NOT EXISTS idx_nodes_file_path ON nodes(file_path)",
	"CREATE INDEX IF NOT EXISTS idx_nodes_type ON nodes(type)",
	"CREATE INDEX IF NOT EXISTS idx_nodes_name ON nodes(name)",
	"CREATE INDEX IF NOT EXISTS idx_nodes_module ON nodes(module)",
	"CREATE INDEX IF NOT EXISTS idx_nodes_package ON nodes(package)",
	"CREATE INDEX IF NOT EXISTS idx_nodes_exported ON nodes(exported)",

	// Edge indexes for traversal queries
	"CREATE INDEX IF NOT EXISTS idx_edges_source ON edges(source)",
	"CREATE INDEX IF NOT EXISTS idx_edges_target ON edges(target)",
	"CREATE INDEX IF NOT EXISTS idx_edges_type ON edges(type)",
];

/**
 * Initialize the schema on a database connection.
 * Creates tables and indexes if they don't exist.
 *
 * @param db - better-sqlite3 database instance
 */
export const initializeSchema = (db: Database.Database): void => {
	// Create tables
	db.exec(NODES_TABLE);
	db.exec(EDGES_TABLE);

	// Create indexes
	for (const indexSql of INDEXES) {
		db.exec(indexSql);
	}
};

/**
 * Drop all tables (for clearAll operation).
 *
 * @param db - better-sqlite3 database instance
 */
export const dropAllTables = (db: Database.Database): void => {
	db.exec("DROP TABLE IF EXISTS edges");
	db.exec("DROP TABLE IF EXISTS nodes");
};
