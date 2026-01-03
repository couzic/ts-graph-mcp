import type Database from "better-sqlite3";

/**
 * HTTP API version - bump when HTTP endpoints change in incompatible ways.
 */
export const HTTP_API_VERSION = 1;

/**
 * DB schema version - bump when database schema changes.
 */
export const DB_SCHEMA_VERSION = 1;

/**
 * Set the DB schema version in the SQLite user_version pragma.
 * Called by initializeSchema() before creating tables.
 */
export const setDbSchemaVersion = (db: Database.Database): void => {
  db.pragma(`user_version = ${DB_SCHEMA_VERSION}`);
};
