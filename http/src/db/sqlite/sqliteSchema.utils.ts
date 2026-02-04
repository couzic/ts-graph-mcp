import type Database from "better-sqlite3";
import { setDbSchemaVersion } from "../versions.js";

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
  package TEXT NOT NULL,
  file_path TEXT NOT NULL,
  start_line INTEGER NOT NULL,
  end_line INTEGER NOT NULL,
  exported INTEGER NOT NULL DEFAULT 0,
  properties TEXT NOT NULL DEFAULT '{}',
  content_hash TEXT
)`;

const EDGES_TABLE = `
CREATE TABLE IF NOT EXISTS edges (
  source TEXT NOT NULL,
  target TEXT NOT NULL,
  type TEXT NOT NULL,
  call_count INTEGER,
  call_sites TEXT,
  context TEXT,
  reference_context TEXT,
  PRIMARY KEY (source, target, type)
)`;

const INDEXES = [
  // Node indexes
  "CREATE INDEX IF NOT EXISTS idx_nodes_file_path ON nodes(file_path)",
  "CREATE INDEX IF NOT EXISTS idx_nodes_type ON nodes(type)",
  "CREATE INDEX IF NOT EXISTS idx_nodes_name ON nodes(name)",
  "CREATE INDEX IF NOT EXISTS idx_nodes_package ON nodes(package)",
  "CREATE INDEX IF NOT EXISTS idx_nodes_exported ON nodes(exported)",

  // Edge indexes for traversal queries
  "CREATE INDEX IF NOT EXISTS idx_edges_source ON edges(source)",
  "CREATE INDEX IF NOT EXISTS idx_edges_target ON edges(target)",
  "CREATE INDEX IF NOT EXISTS idx_edges_type ON edges(type)",
];

/**
 * Check if a column exists in a table.
 */
const columnExists = (
  db: Database.Database,
  table: string,
  column: string,
): boolean => {
  const columns = db.pragma(`table_info(${table})`) as Array<{ name: string }>;
  return columns.some((col) => col.name === column);
};

/**
 * Initialize the schema on a database connection.
 * Creates tables and indexes if they don't exist.
 * Migrates existing databases to add new columns.
 *
 * @param db - better-sqlite3 database instance
 */
export const initializeSchema = (db: Database.Database): void => {
  // Set schema version first
  setDbSchemaVersion(db);

  // Create tables
  db.exec(NODES_TABLE);
  db.exec(EDGES_TABLE);

  // Migration: add content_hash column if missing (for existing databases)
  if (!columnExists(db, "nodes", "content_hash")) {
    db.exec("ALTER TABLE nodes ADD COLUMN content_hash TEXT");
  }

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
