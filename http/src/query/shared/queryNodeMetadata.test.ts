import type { Database } from "better-sqlite3";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  closeDatabase,
  openDatabase,
} from "../../db/sqlite/sqliteConnection.utils.js";
import { initializeSchema } from "../../db/sqlite/sqliteSchema.utils.js";
import { queryNodeMetadata } from "./queryNodeMetadata.js";

const insertNode = (
  db: Database,
  id: string,
  name: string,
  type: string,
  pkg: string,
  filePath: string,
) => {
  db.prepare(
    `INSERT INTO nodes (id, name, type, package, file_path, start_line, end_line, exported) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, name, type, pkg, filePath, 1, 10, 1);
};

describe("queryNodeMetadata", () => {
  let db: Database;

  beforeAll(() => {
    db = openDatabase({ path: ":memory:" });
    initializeSchema(db);

    insertNode(
      db,
      "src/api.ts:Function:handler",
      "handler",
      "Function",
      "http",
      "src/api.ts",
    );
    insertNode(
      db,
      "src/service.ts:Function:process",
      "process",
      "Function",
      "http",
      "src/service.ts",
    );
    insertNode(
      db,
      "shared/utils.ts:Variable:format",
      "format",
      "Variable",
      "shared",
      "shared/utils.ts",
    );
    insertNode(
      db,
      "mcp/wrapper.ts:Function:wrap",
      "wrap",
      "Function",
      "mcp",
      "mcp/wrapper.ts",
    );
    insertNode(
      db,
      "src/User.ts:Class:User",
      "User",
      "Class",
      "http",
      "src/User.ts",
    );
    insertNode(
      db,
      "src/User.ts:Method:User.save",
      "User.save",
      "Method",
      "http",
      "src/User.ts",
    );
    insertNode(
      db,
      "src/types.ts:Interface:Config",
      "Config",
      "Interface",
      "http",
      "src/types.ts",
    );
  });

  afterAll(() => {
    closeDatabase(db);
  });

  it("returns empty map for empty input", () => {
    const result = queryNodeMetadata(db, []);

    expect(result.size).toBe(0);
  });

  it("returns metadata for single node", () => {
    const result = queryNodeMetadata(db, ["src/api.ts:Function:handler"]);

    expect(result.get("src/api.ts:Function:handler")).toEqual({
      package: "http",
      type: "Function",
    });
  });

  it("returns metadata for multiple nodes", () => {
    const result = queryNodeMetadata(db, [
      "src/api.ts:Function:handler",
      "shared/utils.ts:Variable:format",
      "mcp/wrapper.ts:Function:wrap",
    ]);

    expect(result.get("src/api.ts:Function:handler")).toEqual({
      package: "http",
      type: "Function",
    });
    expect(result.get("shared/utils.ts:Variable:format")).toEqual({
      package: "shared",
      type: "Variable",
    });
    expect(result.get("mcp/wrapper.ts:Function:wrap")).toEqual({
      package: "mcp",
      type: "Function",
    });
  });

  it("returns same package for nodes in same package", () => {
    const result = queryNodeMetadata(db, [
      "src/api.ts:Function:handler",
      "src/service.ts:Function:process",
    ]);

    expect(result.get("src/api.ts:Function:handler")?.package).toBe("http");
    expect(result.get("src/service.ts:Function:process")?.package).toBe("http");
  });

  it("returns different types for different node types", () => {
    const result = queryNodeMetadata(db, [
      "src/api.ts:Function:handler",
      "src/User.ts:Class:User",
      "src/User.ts:Method:User.save",
      "src/types.ts:Interface:Config",
      "shared/utils.ts:Variable:format",
    ]);

    expect(result.get("src/api.ts:Function:handler")?.type).toBe("Function");
    expect(result.get("src/User.ts:Class:User")?.type).toBe("Class");
    expect(result.get("src/User.ts:Method:User.save")?.type).toBe("Method");
    expect(result.get("src/types.ts:Interface:Config")?.type).toBe("Interface");
    expect(result.get("shared/utils.ts:Variable:format")?.type).toBe(
      "Variable",
    );
  });

  it("ignores unknown node IDs", () => {
    const result = queryNodeMetadata(db, [
      "src/api.ts:Function:handler",
      "unknown/file.ts:Function:unknown",
    ]);

    expect(result.size).toBe(1);
    expect(result.get("src/api.ts:Function:handler")).toEqual({
      package: "http",
      type: "Function",
    });
    expect(result.has("unknown/file.ts:Function:unknown")).toBe(false);
  });
});
