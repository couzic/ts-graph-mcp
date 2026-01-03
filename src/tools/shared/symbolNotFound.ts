import type Database from "better-sqlite3";
import type { NodeType } from "../../db/Types.js";
import { levenshteinDistance } from "./levenshteinDistance.js";

interface SymbolInFile {
  name: string;
  type: NodeType;
}

interface SymbolElsewhere {
  filePath: string;
  type: NodeType;
}

/**
 * Generates a rich error message when a symbol lookup fails.
 * Distinguishes between different failure modes and provides actionable guidance.
 *
 * Error cases:
 * 1. File not indexed → "File 'X' is not indexed. Indexed packages: ..."
 * 2. Symbol not in file → "Symbol 'X' not found. Available: ..."
 * 3. Symbol in wrong file → also shows where the symbol was found
 *
 * @example
 * symbolNotFound(db, 'src/utils.ts', 'formatDate')
 * // "Symbol 'formatDate' not found at src/utils.ts\n\nFound in:\n  - src/date/format.ts (Function)"
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
      "SELECT name, type FROM nodes WHERE file_path = ? AND type != 'File' ORDER BY start_line LIMIT 5",
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
