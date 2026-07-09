import { DatabaseSync } from "node:sqlite";
import type { SqliteDb } from "./sqlite/SqliteDb.js";

/**
 * HTTP API version - bump when HTTP endpoints change in incompatible ways.
 */
export const HTTP_API_VERSION = 1;

/**
 * DB schema version - bump when database schema changes.
 */
export const DB_SCHEMA_VERSION = 2;

/**
 * Set the DB schema version in the SQLite user_version pragma.
 * Called by initializeSchema() before creating tables.
 */
export const setDbSchemaVersion = (db: SqliteDb): void => {
  db.exec(`PRAGMA user_version = ${DB_SCHEMA_VERSION}`);
};

/**
 * Read the schema version from an open connection.
 * A database that never had its version set reports 0.
 */
export const getDbSchemaVersion = (db: SqliteDb): number => {
  const row = db
    .prepare<[], { user_version: number }>("PRAGMA user_version")
    .get();
  return row?.user_version ?? 0;
};

/**
 * Read the schema version from an on-disk SQLite DB without mutating it.
 * Used to detect schema migrations before `openDatabase` auto-upgrades them.
 *
 * `readOnly` is spelled differently from better-sqlite3's `readonly`, and
 * node:sqlite ignores unknown options rather than rejecting them.
 *
 * @example
 * const version = readSchemaVersion("/path/to/graph.db"); // 1
 */
export const readSchemaVersion = (dbPath: string): number => {
  const db = new DatabaseSync(dbPath, {
    readOnly: true,
  }) as unknown as SqliteDb;
  try {
    return getDbSchemaVersion(db);
  } finally {
    db.close();
  }
};
