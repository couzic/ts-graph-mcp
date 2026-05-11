import Database from "better-sqlite3";

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
export const setDbSchemaVersion = (db: Database.Database): void => {
  db.pragma(`user_version = ${DB_SCHEMA_VERSION}`);
};

/**
 * Read the schema version from an on-disk SQLite DB without mutating it.
 * Used to detect schema migrations before `openDatabase` auto-upgrades them.
 *
 * @example
 * const version = readSchemaVersion("/path/to/graph.db"); // 1
 */
export const readSchemaVersion = (dbPath: string): number => {
  const db = new Database(dbPath, { readonly: true });
  try {
    const result = db.pragma("user_version") as Array<{ user_version: number }>;
    return result[0]?.user_version ?? 0;
  } finally {
    db.close();
  }
};
