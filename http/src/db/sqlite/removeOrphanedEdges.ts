import type Database from "better-sqlite3";

/**
 * Remove edges whose target node no longer exists in the nodes table.
 * Returns the number of orphaned edges removed.
 *
 * @example
 * const removed = removeOrphanedEdges(db);
 * // removed = 12
 */
export const removeOrphanedEdges = (db: Database.Database): number => {
  const result = db
    .prepare(`DELETE FROM edges WHERE target NOT IN (SELECT id FROM nodes)`)
    .run();
  return result.changes;
};
