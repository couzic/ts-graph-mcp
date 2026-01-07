import type Database from "better-sqlite3";
import type { NodeInfo } from "./GraphTypes.js";

/**
 * Raw node row from SQLite query (subset of columns needed for tool output).
 */
interface NodeRow {
  id: string;
  name: string;
  file_path: string;
  start_line: number;
  end_line: number;
}

/**
 * Query node information for a list of node IDs.
 *
 * Returns NodeInfo objects suitable for the Nodes section output.
 */
export const queryNodeInfos = (
  db: Database.Database,
  nodeIds: string[],
): NodeInfo[] => {
  if (nodeIds.length === 0) return [];

  const placeholders = nodeIds.map(() => "?").join(", ");
  const sql = `
		SELECT id, name, file_path, start_line, end_line
		FROM nodes
		WHERE id IN (${placeholders})
	`;

  const rows = db.prepare<unknown[], NodeRow>(sql).all(...nodeIds);

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    filePath: row.file_path,
    startLine: row.start_line,
    endLine: row.end_line,
  }));
};
