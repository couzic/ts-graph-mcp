import type Database from "better-sqlite3";
import { Project } from "ts-morph";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { DbWriter } from "../../db/DbWriter.js";
import { createSqliteWriter } from "../../db/sqlite/createSqliteWriter.js";
import {
  closeDatabase,
  openDatabase,
} from "../../db/sqlite/sqliteConnection.utils.js";
import { extractNodes } from "../../ingestion/extract/nodes/extractNodes.js";
import { symbolNotFound } from "./symbolNotFound.js";

describe("symbolNotFound", () => {
  let db: Database.Database;
  let writer: DbWriter;
  let project: Project;

  beforeEach(() => {
    db = openDatabase({ path: ":memory:" });
    writer = createSqliteWriter(db);
    project = new Project({ useInMemoryFileSystem: true });
  });

  afterEach(() => {
    closeDatabase(db);
  });

  const createContext = (filePath: string) => ({
    filePath,
    package: "test-pkg",
  });

  it("returns 'file not indexed' when no nodes exist for file", () => {
    const result = symbolNotFound(db, "src/utils.ts", "formatDate");

    expect(result).toBe("File 'src/utils.ts' is not indexed.");
  });

  it("shows where symbol exists when file is not indexed", async () => {
    // Index a file with formatDate
    const indexedPath = "src/dateUtils.ts";
    const sourceFile = project.createSourceFile(
      indexedPath,
      "export function formatDate() {}",
    );
    await writer.addNodes(extractNodes(sourceFile, createContext(indexedPath)));

    // Query for formatDate in a file that is NOT indexed
    const result = symbolNotFound(db, "src/other.ts", "formatDate");

    expect(result).toContain("File 'src/other.ts' is not indexed");
    expect(result).toContain("Found 'formatDate' in:");
    expect(result).toContain("src/dateUtils.ts");
  });

  it("shows available symbols when symbol not found in indexed file", async () => {
    const filePath = "src/utils.ts";
    const sourceFile = project.createSourceFile(
      filePath,
      `export function formatDate() {}
export function parseDate() {}
export const MAX_DATE = 100;`,
    );
    const nodes = extractNodes(sourceFile, createContext(filePath));
    await writer.addNodes(nodes);

    const result = symbolNotFound(db, filePath, "invalidSymbol");

    expect(result).toContain(
      "Symbol 'invalidSymbol' not found at src/utils.ts",
    );
    expect(result).toContain("Available symbols in this file:");
    expect(result).toContain("formatDate (Function)");
    expect(result).toContain("parseDate (Function)");
    expect(result).toContain("MAX_DATE (Variable)");
  });

  it("shows where symbol exists when found in other files", async () => {
    // Index file A with the symbol
    const fileA = "src/dateUtils.ts";
    const sourceA = project.createSourceFile(
      fileA,
      "export function formatDate() {}",
    );
    await writer.addNodes(extractNodes(sourceA, createContext(fileA)));

    // Index file B without the symbol
    const fileB = "src/utils.ts";
    const sourceB = project.createSourceFile(
      fileB,
      "export function helper() {}",
    );
    await writer.addNodes(extractNodes(sourceB, createContext(fileB)));

    const result = symbolNotFound(db, fileB, "formatDate");

    expect(result).toContain("Symbol 'formatDate' not found at src/utils.ts");
    expect(result).toContain("Found 'formatDate' in:");
    expect(result).toContain("src/dateUtils.ts");
  });

  it("performs case-insensitive match for symbol elsewhere", async () => {
    // Index file with camelCase symbol
    const fileA = "src/format.ts";
    const sourceA = project.createSourceFile(
      fileA,
      "export function formatDate() {}",
    );
    await writer.addNodes(extractNodes(sourceA, createContext(fileA)));

    // Index file B
    const fileB = "src/other.ts";
    const sourceB = project.createSourceFile(
      fileB,
      "export function other() {}",
    );
    await writer.addNodes(extractNodes(sourceB, createContext(fileB)));

    // Search with different case
    const result = symbolNotFound(db, fileB, "formatdate");

    expect(result).toContain("Found 'formatdate' in:");
    expect(result).toContain("src/format.ts");
  });

  it("sorts available symbols by similarity to searched symbol", async () => {
    const filePath = "src/utils.ts";
    const sourceFile = project.createSourceFile(
      filePath,
      `export function apple() {}
export function formatDat() {}
export function banana() {}`,
    );
    await writer.addNodes(extractNodes(sourceFile, createContext(filePath)));

    const result = symbolNotFound(db, filePath, "formatDate");

    // formatDat should appear first (closest to formatDate)
    const lines = result.split("\n");
    const formatDatLine = lines.findIndex((l) => l.includes("formatDat"));
    const appleLine = lines.findIndex((l) => l.includes("apple"));
    const bananaLine = lines.findIndex((l) => l.includes("banana"));

    expect(formatDatLine).toBeLessThan(appleLine);
    expect(formatDatLine).toBeLessThan(bananaLine);
  });

  it("sorts file paths by similarity to searched path", async () => {
    // Index the symbol in multiple files
    const files = ["libs/date.ts", "src/utils/date.ts", "src/util/date.ts"];

    for (const filePath of files) {
      const sourceFile = project.createSourceFile(
        filePath,
        "export function formatDate() {}",
      );
      await writer.addNodes(extractNodes(sourceFile, createContext(filePath)));
    }

    // Index search file without formatDate
    const searchPath = "src/utils/format.ts";
    const sourceFile = project.createSourceFile(
      searchPath,
      "export function other() {}",
    );
    await writer.addNodes(extractNodes(sourceFile, createContext(searchPath)));

    const result = symbolNotFound(db, searchPath, "formatDate");

    // src/utils/date.ts should appear first (closest to src/utils/format.ts)
    const lines = result.split("\n");
    const utilsDateLine = lines.findIndex((l) =>
      l.includes("src/utils/date.ts"),
    );
    const utilDateLine = lines.findIndex((l) => l.includes("src/util/date.ts"));
    const libsDateLine = lines.findIndex((l) => l.includes("libs/date.ts"));

    expect(utilsDateLine).toBeLessThan(utilDateLine);
    expect(utilsDateLine).toBeLessThan(libsDateLine);
  });

  it("handles empty database gracefully", () => {
    const result = symbolNotFound(db, "src/file.ts", "something");

    expect(result).toBe("File 'src/file.ts' is not indexed.");
  });

  it("shows both available symbols and found elsewhere when applicable", async () => {
    // Index file A with formatDate
    const fileA = "src/dateUtils.ts";
    const sourceA = project.createSourceFile(
      fileA,
      "export function formatDate() {}",
    );
    await writer.addNodes(extractNodes(sourceA, createContext(fileA)));

    // Index file B with other symbols
    const fileB = "src/utils.ts";
    const sourceB = project.createSourceFile(
      fileB,
      `export function helper() {}
export function parser() {}`,
    );
    await writer.addNodes(extractNodes(sourceB, createContext(fileB)));

    const result = symbolNotFound(db, fileB, "formatDate");

    // Should show both sections
    expect(result).toContain("Available symbols in this file:");
    expect(result).toContain("helper (Function)");
    expect(result).toContain("Found 'formatDate' in:");
    expect(result).toContain("src/dateUtils.ts");
  });
});
