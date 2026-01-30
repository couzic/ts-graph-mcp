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
import { resolveSymbol, symbolNotFound } from "./symbolNotFound.js";

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

describe("resolveSymbol", () => {
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

  it("returns success for exact match", async () => {
    const filePath = "src/utils.ts";
    const sourceFile = project.createSourceFile(
      filePath,
      "export function formatDate() {}",
    );
    await writer.addNodes(extractNodes(sourceFile, createContext(filePath)));

    const result = resolveSymbol(db, filePath, "formatDate");

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.nodeId).toBe("src/utils.ts:formatDate");
      expect(result.message).toBeUndefined();
    }
  });

  it("auto-resolves method name to ClassName.methodName", async () => {
    const filePath = "src/entity.ts";
    const sourceFile = project.createSourceFile(
      filePath,
      `export class User {
        getSituations() { return []; }
      }`,
    );
    await writer.addNodes(extractNodes(sourceFile, createContext(filePath)));

    // Search for method without class prefix
    const result = resolveSymbol(db, filePath, "getSituations");

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.nodeId).toBe("src/entity.ts:User.getSituations");
      expect(result.message).toContain("Found 'getSituations' as User.getSituations in src/entity.ts");
    }
  });

  it("auto-resolves to symbol in different file", async () => {
    // Index file A with formatDate
    const fileA = "src/dateUtils.ts";
    const sourceA = project.createSourceFile(
      fileA,
      "export function formatDate() {}",
    );
    await writer.addNodes(extractNodes(sourceA, createContext(fileA)));

    // Search for formatDate in a different file
    const result = resolveSymbol(db, "src/other.ts", "formatDate");

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.nodeId).toBe("src/dateUtils.ts:formatDate");
      expect(result.message).toContain("Found 'formatDate' in src/dateUtils.ts");
    }
  });

  it("returns disambiguation when multiple matches found", async () => {
    // Index two classes with same method name
    const fileA = "src/user.ts";
    const sourceA = project.createSourceFile(
      fileA,
      `export class User {
        getLines() { return []; }
      }`,
    );
    await writer.addNodes(extractNodes(sourceA, createContext(fileA)));

    const fileB = "src/order.ts";
    const sourceB = project.createSourceFile(
      fileB,
      `export class Order {
        getLines() { return []; }
      }`,
    );
    await writer.addNodes(extractNodes(sourceB, createContext(fileB)));

    const result = resolveSymbol(db, "src/other.ts", "getLines");

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("Multiple symbols named 'getLines' found:");
      expect(result.error).toContain("User.getLines");
      expect(result.error).toContain("Order.getLines");
    }
  });

  it("returns error when no matches found", async () => {
    // Index a file with different symbol
    const filePath = "src/utils.ts";
    const sourceFile = project.createSourceFile(
      filePath,
      "export function helper() {}",
    );
    await writer.addNodes(extractNodes(sourceFile, createContext(filePath)));

    const result = resolveSymbol(db, filePath, "nonExistent");

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("Symbol 'nonExistent' not found");
    }
  });

  it("performs case-insensitive method name matching", async () => {
    const filePath = "src/entity.ts";
    const sourceFile = project.createSourceFile(
      filePath,
      `export class User {
        GetData() { return {}; }
      }`,
    );
    await writer.addNodes(extractNodes(sourceFile, createContext(filePath)));

    // Search with different case
    const result = resolveSymbol(db, filePath, "getdata");

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.nodeId).toBe("src/entity.ts:User.GetData");
    }
  });

  it("resolves symbol when file_path is undefined (single match)", async () => {
    const filePath = "src/utils.ts";
    const sourceFile = project.createSourceFile(
      filePath,
      "export function formatDate() {}",
    );
    await writer.addNodes(extractNodes(sourceFile, createContext(filePath)));

    const result = resolveSymbol(db, undefined, "formatDate");

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.nodeId).toBe("src/utils.ts:formatDate");
      expect(result.message).toContain("Found 'formatDate' in src/utils.ts");
      expect(result.filePathWasResolved).toBe(true);
    }
  });

  it("returns disambiguation when file_path undefined and multiple matches", async () => {
    const fileA = "src/dateA.ts";
    const sourceA = project.createSourceFile(
      fileA,
      "export function formatDate() {}",
    );
    await writer.addNodes(extractNodes(sourceA, createContext(fileA)));

    const fileB = "src/dateB.ts";
    const sourceB = project.createSourceFile(
      fileB,
      "export function formatDate() {}",
    );
    await writer.addNodes(extractNodes(sourceB, createContext(fileB)));

    const result = resolveSymbol(db, undefined, "formatDate");

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("Multiple symbols named 'formatDate' found:");
      expect(result.error).toContain("src/dateA.ts");
      expect(result.error).toContain("src/dateB.ts");
    }
  });

  it("returns error when file_path undefined and symbol not found", async () => {
    const result = resolveSymbol(db, undefined, "nonExistent");

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe("Symbol 'nonExistent' not found.");
    }
  });

  it("resolves fully-qualified method name (ClassName.methodName)", async () => {
    const filePath = "src/entity.ts";
    const sourceFile = project.createSourceFile(
      filePath,
      `export class User {
        getSituations() { return []; }
      }`,
    );
    await writer.addNodes(extractNodes(sourceFile, createContext(filePath)));

    // Search with fully-qualified method name (as suggested by disambiguation message)
    const result = resolveSymbol(db, undefined, "User.getSituations");

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.nodeId).toBe("src/entity.ts:User.getSituations");
    }
  });

  it("resolves method within specified file when same method name exists in multiple files", async () => {
    // This tests the fix for the disambiguation bug:
    // When filePath is provided and exact match fails (because node ID is Class.method),
    // it should search within that specific file first, not globally.

    // File A has User.save
    const fileA = "src/user.ts";
    const sourceA = project.createSourceFile(
      fileA,
      `export class User {
        save() { return true; }
      }`,
    );
    await writer.addNodes(extractNodes(sourceA, createContext(fileA)));

    // File B also has a save method (Order.save)
    const fileB = "src/order.ts";
    const sourceB = project.createSourceFile(
      fileB,
      `export class Order {
        save() { return true; }
      }`,
    );
    await writer.addNodes(extractNodes(sourceB, createContext(fileB)));

    // When resolving "save" with fileA specified, should find User.save in fileA
    // even though there are multiple "save" methods globally
    const result = resolveSymbol(db, fileA, "save");

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.nodeId).toBe("src/user.ts:User.save");
      expect(result.message).toContain("User.save");
    }
  });

  it("sets filePathWasResolved to false when file_path is provided", async () => {
    const filePath = "src/utils.ts";
    const sourceFile = project.createSourceFile(
      filePath,
      "export function helper() {}",
    );
    await writer.addNodes(extractNodes(sourceFile, createContext(filePath)));

    // Method name requires resolution even with file_path provided
    const sourceFile2 = project.createSourceFile(
      "src/entity.ts",
      `export class User { save() {} }`,
    );
    await writer.addNodes(extractNodes(sourceFile2, createContext("src/entity.ts")));

    const result = resolveSymbol(db, "src/entity.ts", "save");

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.filePathWasResolved).toBeFalsy();
    }
  });
});
