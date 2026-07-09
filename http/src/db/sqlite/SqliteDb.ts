import type Database from "better-sqlite3";

/**
 * The SQLite database handle passed to every reader, writer and query function.
 *
 * Declaring the handle through this alias keeps the driver named in exactly one
 * place, so swapping drivers does not touch the query or ingestion layers.
 */
export type SqliteDb = Database.Database;
