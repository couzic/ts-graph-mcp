import { existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { SqliteDb } from "./SqliteDb.js";
import { initializeSchema } from "./sqliteSchema.utils.js";

export interface SqliteConnectionOptions {
  /** Path to the database file. Use ':memory:' for in-memory database. */
  path: string;
}

/**
 * Open or create a SQLite database connection.
 * Initializes schema if the database is new.
 *
 * @param options - Connection options
 * @returns Initialized database instance
 */
export const openDatabase = (options: SqliteConnectionOptions): SqliteDb => {
  const { path } = options;

  // Ensure parent directory exists (unless in-memory)
  if (path !== ":memory:") {
    const dir = dirname(path);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
  }

  // The driver boundary: DatabaseSync erases row shapes, SqliteDb restores them.
  const db = new DatabaseSync(path) as unknown as SqliteDb;

  // Performance settings
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA synchronous = NORMAL");
  db.exec("PRAGMA cache_size = -64000"); // 64MB cache

  // Initialize schema
  initializeSchema(db);

  return db;
};

/**
 * Close the database connection.
 *
 * @param db - Database instance to close
 */
export const closeDatabase = (db: SqliteDb): void => {
  db.close();
};
