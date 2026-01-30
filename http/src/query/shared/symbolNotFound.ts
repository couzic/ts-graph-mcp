import type { NodeType } from "@ts-graph/shared";
import type Database from "better-sqlite3";
import { levenshteinDistance } from "./levenshteinDistance.js";

interface SymbolInFile {
  name: string;
  type: NodeType;
}

interface SymbolElsewhere {
  filePath: string;
  type: NodeType;
}

interface SymbolMatch {
  nodeId: string;
  name: string;
  filePath: string;
  type: NodeType;
}

/**
 * Result of attempting to resolve a symbol.
 */
export type SymbolResolution =
  | { success: true; nodeId: string; message?: string; filePathWasResolved?: boolean }
  | { success: false; error: string };

/**
 * Find all symbols matching the given name within a specific file.
 * Searches for exact matches and method matches (*.symbol).
 */
const findSymbolMatchesInFile = (
  db: Database.Database,
  symbol: string,
  filePath: string,
): SymbolMatch[] => {
  const rows = db
    .prepare<
      [string, string, string, string],
      { id: string; name: string; file_path: string; type: NodeType }
    >(
      `SELECT id, name, file_path, type FROM nodes
       WHERE file_path = ?
         AND (LOWER(name) = LOWER(?)
              OR LOWER(name) LIKE '%.' || LOWER(?)
              OR LOWER(SUBSTR(id, INSTR(id, ':') + 1)) = LOWER(?))
       LIMIT 10`,
    )
    .all(filePath, symbol, symbol, symbol);

  return rows.map((r) => {
    const colonIndex = r.id.indexOf(":");
    const symbolFromId = colonIndex >= 0 ? r.id.slice(colonIndex + 1) : r.name;
    return {
      nodeId: r.id,
      name: symbolFromId,
      filePath: r.file_path,
      type: r.type,
    };
  });
};

/**
 * Find all symbols matching the given name.
 * Searches for exact matches, method matches (*.symbol), and symbol path matches.
 */
const findSymbolMatches = (
  db: Database.Database,
  symbol: string,
): SymbolMatch[] => {
  const rows = db
    .prepare<
      [string, string, string],
      { id: string; name: string; file_path: string; type: NodeType }
    >(
      `SELECT id, name, file_path, type FROM nodes
       WHERE (LOWER(name) = LOWER(?)
              OR LOWER(name) LIKE '%.' || LOWER(?)
              OR LOWER(SUBSTR(id, INSTR(id, ':') + 1)) = LOWER(?))
       LIMIT 10`,
    )
    .all(symbol, symbol, symbol);

  return rows.map((r) => {
    const colonIndex = r.id.indexOf(":");
    const symbolFromId = colonIndex >= 0 ? r.id.slice(colonIndex + 1) : r.name;
    return {
      nodeId: r.id,
      name: symbolFromId,
      filePath: r.file_path,
      type: r.type,
    };
  });
};

/**
 * Attempt to resolve a symbol, including method name auto-resolution.
 *
 * Resolution order:
 * 1. If filePath provided: exact match `{filePath}:{symbol}`
 * 2. Exact name match anywhere (e.g., top-level function)
 * 3. Method name match: symbols ending with `.{symbol}` (e.g., `ClassName.methodName`)
 *
 * When filePath is omitted, searches across all files.
 *
 * @example
 * // With file_path - exact match
 * resolveSymbol(db, 'src/entity.ts', 'getSituations')
 * // { success: true, nodeId: 'src/entity.ts:User.getSituations', message: "Found 'getSituations' as User.getSituations in src/entity.ts" }
 *
 * // Without file_path - auto-resolves if unique
 * resolveSymbol(db, undefined, 'formatDate')
 * // { success: true, nodeId: 'src/utils.ts:formatDate', message: "Found 'formatDate' in src/utils.ts", filePathWasResolved: true }
 *
 * // Multiple matches - disambiguation
 * resolveSymbol(db, undefined, 'getLines')
 * // { success: false, error: "Multiple symbols named 'getLines' found:\n  - User.getLines (src/user.ts)\n  - Order.getLines (src/order.ts)" }
 */
export const resolveSymbol = (
  db: Database.Database,
  filePath: string | undefined,
  symbol: string,
): SymbolResolution => {
  // When filePath provided, try exact match first
  if (filePath) {
    const nodeId = `${filePath}:${symbol}`;
    const exactMatch = db
      .prepare<[string], { found: 1 }>("SELECT 1 as found FROM nodes WHERE id = ?")
      .get(nodeId);

    if (exactMatch) {
      return { success: true, nodeId };
    }

    // Exact match failed, but we have a file path - search within that file first
    const matchesInFile = findSymbolMatchesInFile(db, symbol, filePath);
    if (matchesInFile.length === 1) {
      const match = matchesInFile[0]!;
      const message =
        match.name === symbol
          ? `Found '${symbol}' in ${match.filePath}`
          : `Found '${symbol}' as ${match.name} in ${match.filePath}`;
      return { success: true, nodeId: match.nodeId, message };
    }
    if (matchesInFile.length > 1) {
      // Multiple matches within the same file - disambiguation
      const lines = [`Multiple symbols named '${symbol}' found in ${filePath}:`];
      for (const match of matchesInFile) {
        lines.push(`  - ${match.name}`);
      }
      return { success: false, error: lines.join("\n") };
    }
    // No matches in specified file - fall through to global search
  }

  // Search for matches across codebase
  const matches = findSymbolMatches(db, symbol);

  if (matches.length === 0) {
    if (filePath) {
      return { success: false, error: symbolNotFound(db, filePath, symbol) };
    }
    return { success: false, error: `Symbol '${symbol}' not found.` };
  }

  if (matches.length === 1) {
    const match = matches[0]!;
    const filePathWasResolved = !filePath;
    const message =
      match.name === symbol
        ? `Found '${symbol}' in ${match.filePath}`
        : `Found '${symbol}' as ${match.name} in ${match.filePath}`;
    return { success: true, nodeId: match.nodeId, message, filePathWasResolved };
  }

  // Multiple matches - disambiguation
  const lines = [`Multiple symbols named '${symbol}' found:`];
  for (const match of matches) {
    lines.push(`  - ${match.name} (${match.filePath})`);
  }
  return { success: false, error: lines.join("\n") };
};

/**
 * Generates a rich error message when a symbol lookup fails.
 * Distinguishes between different failure modes and provides actionable guidance.
 *
 * Error cases:
 * 1. File not indexed → "File 'X' is not indexed."
 * 2. Symbol not in file → "Symbol 'X' not found. Available: ..." (up to 5 symbols, sorted by similarity)
 * 3. Symbol exists elsewhere → shows where the symbol was found
 *
 * @example
 * symbolNotFound(db, 'src/utils.ts', 'formatDate')
 * // "Symbol 'formatDate' not found at src/utils.ts\n\nFound in:\n  - src/date/format.ts"
 */
export const symbolNotFound = (
  db: Database.Database,
  filePath: string,
  symbol: string,
): string => {
  // 1. Check if file is indexed
  const fileIndexed = db
    .prepare<[string], { found: 1 }>(
      "SELECT 1 as found FROM nodes WHERE file_path = ? LIMIT 1",
    )
    .get(filePath);

  const symbolElsewhere = findSymbolElsewhere(db, symbol, filePath);

  if (!fileIndexed) {
    const lines: string[] = [`File '${filePath}' is not indexed.`];
    return [...lines, ...formatFoundIn(symbol, symbolElsewhere, filePath)].join(
      "\n",
    );
  }

  const symbolsInFile = getSymbolsInFile(db, filePath);
  const lines: string[] = [`Symbol '${symbol}' not found at ${filePath}`];

  if (symbolsInFile.length > 0) {
    const sortedSymbols = sortBySymbolSimilarity(symbolsInFile, symbol);
    lines.push("");
    lines.push("Available symbols in this file:");
    for (const s of sortedSymbols) {
      lines.push(`  - ${s.name} (${s.type})`);
    }
  }

  return [...lines, ...formatFoundIn(symbol, symbolElsewhere, filePath)].join(
    "\n",
  );
};

const formatFoundIn = (
  symbol: string,
  symbolElsewhere: SymbolElsewhere[],
  filePath: string,
): string[] => {
  if (symbolElsewhere.length === 0) {
    return [];
  }
  const sortedFiles = sortByPathSimilarity(symbolElsewhere, filePath);
  return [
    "",
    `Found '${symbol}' in:`,
    ...sortedFiles.map((s) => `  - ${s.filePath}`),
  ];
};

const getSymbolsInFile = (
  db: Database.Database,
  filePath: string,
): SymbolInFile[] => {
  const rows = db
    .prepare<[string], { name: string; type: NodeType }>(
      "SELECT name, type FROM nodes WHERE file_path = ? ORDER BY start_line LIMIT 5",
    )
    .all(filePath);
  return rows;
};

const findSymbolElsewhere = (
  db: Database.Database,
  symbol: string,
  excludeFilePath: string,
): SymbolElsewhere[] => {
  // Case-insensitive exact match using LOWER()
  const rows = db
    .prepare<[string, string], { file_path: string; type: NodeType }>(
      "SELECT file_path, type FROM nodes WHERE LOWER(name) = LOWER(?) AND file_path != ? LIMIT 5",
    )
    .all(symbol, excludeFilePath);
  return rows.map((r) => ({ filePath: r.file_path, type: r.type }));
};

const sortBySymbolSimilarity = (
  symbols: SymbolInFile[],
  searchedSymbol: string,
): SymbolInFile[] => {
  return [...symbols].sort(
    (a, b) =>
      levenshteinDistance(a.name, searchedSymbol) -
      levenshteinDistance(b.name, searchedSymbol),
  );
};

const sortByPathSimilarity = (
  files: SymbolElsewhere[],
  searchedPath: string,
): SymbolElsewhere[] => {
  return [...files].sort(
    (a, b) =>
      levenshteinDistance(a.filePath, searchedPath) -
      levenshteinDistance(b.filePath, searchedPath),
  );
};
