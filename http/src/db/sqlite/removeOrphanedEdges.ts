import type { SqliteDb } from "./SqliteDb.js";

/**
 * Remove edges whose target node no longer exists in the nodes table.
 * Returns the number of orphaned edges removed.
 *
 * @example
 * const removed = removeOrphanedEdges(db);
 * // removed = 12
 */
export const removeOrphanedEdges = (db: SqliteDb): number => {
  const result = db
    .prepare(`DELETE FROM edges WHERE target NOT IN (SELECT id FROM nodes)`)
    .run();
  // node:sqlite widens `changes` to number | bigint.
  return Number(result.changes);
};
