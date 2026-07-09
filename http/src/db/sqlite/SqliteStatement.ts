import type { StatementSync } from "node:sqlite";

/**
 * A prepared statement with a typed row shape.
 *
 * node:sqlite's `StatementSync` returns `Record<string, SQLOutputValue>`, which
 * erases the row shape and forces index-signature access at every call site.
 * This interface carries the shape the caller declared, the way better-sqlite3's
 * `Statement<BindParameters, Result>` did.
 */
export interface SqliteStatement<Params extends unknown[], Row> {
  get(...params: Params): Row | undefined;
  all(...params: Params): Row[];
  run(...params: Params): ReturnType<StatementSync["run"]>;
}
