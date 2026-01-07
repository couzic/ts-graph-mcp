import { existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import Database from "better-sqlite3";
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
export const openDatabase = (
  options: SqliteConnectionOptions,
): Database.Database => {
  const { path } = options;

  // Ensure parent directory exists (unless in-memory)
  if (path !== ":memory:") {
    const dir = dirname(path);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
  }

  const db = new Database(path);

  // Performance settings
  db.pragma("journal_mode = WAL");
  db.pragma("synchronous = NORMAL");
  db.pragma("cache_size = -64000"); // 64MB cache

  // Initialize schema
  initializeSchema(db);

  return db;
};

/**
 * Close the database connection.
 *
 * @param db - Database instance to close
 */
export const closeDatabase = (db: Database.Database): void => {
  db.close();
};
