import type { SqliteStatement } from "./SqliteStatement.js";

/**
 * The SQLite database handle passed to every reader, writer and query function.
 *
 * A structural view of node:sqlite's `DatabaseSync`, restricted to what this
 * codebase uses and re-typed so `prepare()` carries the caller's row shape.
 * Declaring the handle through this interface keeps the driver named in exactly
 * one place: `openDatabase`.
 */
export interface SqliteDb {
  prepare<Params extends unknown[] = unknown[], Row = unknown>(
    sql: string,
  ): SqliteStatement<Params, Row>;
  exec(sql: string): void;
  close(): void;
}
