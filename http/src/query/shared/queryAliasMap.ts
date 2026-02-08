import type Database from "better-sqlite3";
import { extractSymbol } from "./extractSymbol.js";

/**
 * Query the DB for alias mappings relevant to the given node IDs.
 * Finds ALIAS_FOR edges from TypeAlias nodes to SyntheticType nodes,
 * enabling display simplification (e.g., "Service.fetchAll" instead of
 * "ReturnType<typeof createService>.fetchAll").
 *
 * @example
 * // Given nodes with symbols like "ReturnType<typeof createService>.fetchAll"
 * queryAliasMap(db, ["src/s.ts:Function:ReturnType<typeof createService>.fetchAll"])
 * // Map { "ReturnType<typeof createService>" => "Service" }
 */
export const queryAliasMap = (
  db: Database.Database,
  nodeIds: string[],
): Map<string, string> => {
  const aliasMap = new Map<string, string>();

  // Find ReturnType<typeof X> prefixes in the node IDs
  const syntheticPrefixes = new Set<string>();
  for (const nodeId of nodeIds) {
    const symbol = extractSymbol(nodeId);
    const match = symbol.match(/^(ReturnType<typeof \w+>)/);
    if (match?.[1]) {
      syntheticPrefixes.add(match[1]);
    }
  }

  if (syntheticPrefixes.size === 0) {
    return aliasMap;
  }

  // Query for ALIAS_FOR edges targeting SyntheticType nodes with these names
  for (const syntheticName of syntheticPrefixes) {
    const row = db
      .prepare<[string, string], { source: string }>(
        `SELECT e.source FROM edges e
         JOIN nodes n ON e.target = n.id
         WHERE n.type = 'SyntheticType'
           AND n.name = ?
           AND e.type = ?
         LIMIT 1`,
      )
      .get(syntheticName, "ALIAS_FOR");

    if (row) {
      const aliasName = extractSymbol(row.source);
      aliasMap.set(syntheticName, aliasName);
    }
  }

  return aliasMap;
};
