import type Database from "better-sqlite3";
import type { Node } from "../../db/Types.js";
import type { NodeRow } from "./QueryTypes.js";
import { rowToNode } from "./rowConverters.js";
import type { SymbolQuery } from "./SymbolQuery.js";

export interface SymbolLocation {
  name: string;
  type: string;
  file: string;
  offset: number; // startLine (1-indexed) - for Read tool
  limit: number; // line count - for Read tool
  module: string;
  package: string;
  id: string; // internal nodeId for queries
}

export type ResolveResult =
  | { status: "unique"; node: SymbolLocation }
  | { status: "ambiguous"; candidates: SymbolLocation[] }
  | { status: "not_found"; suggestions?: string[] };

/**
 * Convert a Node to a SymbolLocation.
 */
function nodeToLocation(node: Node): SymbolLocation {
  return {
    name: node.name,
    type: node.type,
    file: node.filePath,
    offset: node.startLine,
    limit: node.endLine - node.startLine + 1,
    module: node.module,
    package: node.package,
    id: node.id,
  };
}

/**
 * Resolve a SymbolQuery to a concrete node.
 *
 * Algorithm:
 * 1. Parse qualified names: "User.save" → search for "save" where ID contains ":User.save"
 * 2. Query: SELECT * FROM nodes WHERE name = ? OR id LIKE ?
 * 3. Apply filters: file, module, package if provided
 * 4. Handle results:
 *    - 0 matches → not_found with fuzzy suggestions
 *    - 1 match → unique with full SymbolLocation
 *    - 2+ matches → ambiguous with all candidates
 */
export function resolveSymbol(
  db: Database.Database,
  query: SymbolQuery,
): ResolveResult {
  const { symbol, file, module, package: pkg } = query;

  // Parse qualified names: "User.save" → ["User", "save"]
  const parts = symbol.split(".");
  const symbolName = parts[parts.length - 1];
  const isQualified = parts.length > 1;

  // Build SQL query with filters
  let sql: string;
  const params: unknown[] = [];

  if (isQualified) {
    // For qualified names: match exact ID suffix ":User.save"
    sql = "SELECT * FROM nodes WHERE id LIKE ?";
    params.push(`%:${symbol}`);
  } else {
    // For simple names: match exact name
    sql = "SELECT * FROM nodes WHERE name = ?";
    params.push(symbolName);
  }

  // Apply filters
  if (file) {
    sql += " AND file_path = ?";
    params.push(file);
  }
  if (module) {
    sql += " AND module = ?";
    params.push(module);
  }
  if (pkg) {
    sql += " AND package = ?";
    params.push(pkg);
  }

  // Execute query
  const rows = db.prepare(sql).all(...params) as NodeRow[];

  // Handle results
  if (rows.length === 0) {
    return generateNotFound(db, symbol);
  }

  if (rows.length === 1) {
    const row = rows[0];
    if (!row) {
      return generateNotFound(db, symbol);
    }
    const node = rowToNode(row);
    return { status: "unique", node: nodeToLocation(node) };
  }

  // Multiple matches - return all candidates
  const candidates = rows.map((row) => nodeToLocation(rowToNode(row)));
  return { status: "ambiguous", candidates };
}

/**
 * Generate not_found result with fuzzy suggestions.
 */
function generateNotFound(
  db: Database.Database,
  symbol: string,
): ResolveResult {
  // Try fuzzy search with LIKE '%symbol%'
  const sql = "SELECT * FROM nodes WHERE name LIKE ? LIMIT 5";
  const rows = db.prepare(sql).all(`%${symbol}%`) as NodeRow[];

  if (rows.length === 0) {
    return { status: "not_found" };
  }

  const suggestions = rows.map((row) => row.name);
  return { status: "not_found", suggestions };
}
