import type Database from "better-sqlite3";
import type { NodeType } from "../../db/Types.js";

export interface NodeMetadata {
  package: string;
  type: NodeType;
}

interface MetadataRow {
  id: string;
  package: string;
  type: NodeType;
}

/**
 * Query package and type metadata for a list of node IDs.
 * Returns Map<nodeId, NodeMetadata>
 *
 * @example
 * const metadata = queryNodeMetadata(db, ["src/api.ts:handler", "src/User.ts:User"]);
 * // Map { "src/api.ts:handler" => { package: "http", type: "Function" }, "src/User.ts:User" => { package: "http", type: "Class" } }
 */
export const queryNodeMetadata = (
  db: Database.Database,
  nodeIds: string[],
): Map<string, NodeMetadata> => {
  if (nodeIds.length === 0) {
    return new Map();
  }

  const placeholders = nodeIds.map(() => "?").join(", ");
  const sql = `
    SELECT id, package, type
    FROM nodes
    WHERE id IN (${placeholders})
  `;

  const rows = db.prepare<unknown[], MetadataRow>(sql).all(...nodeIds);

  const result = new Map<string, NodeMetadata>();
  for (const row of rows) {
    result.set(row.id, { package: row.package, type: row.type });
  }
  return result;
};
