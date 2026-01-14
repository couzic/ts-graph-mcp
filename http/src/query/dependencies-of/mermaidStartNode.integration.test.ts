import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  openDatabase,
  closeDatabase,
} from "../../db/sqlite/sqliteConnection.utils.js";
import { dependenciesOf } from "./dependenciesOf.js";
import type { Database } from "better-sqlite3";
import type { DbWriter } from "../../db/DbWriter.js";
import { createSqliteWriter } from "../../db/sqlite/createSqliteWriter.js";

describe("mermaid start node type-aware display", () => {
  let db: Database;
  let writer: DbWriter;
  const projectRoot = "/test"; // Not used in this test (in-memory DB)

  beforeAll(async () => {
    db = openDatabase({ path: ":memory:" });
    writer = createSqliteWriter(db);

    // Insert test nodes
    await writer.addNodes([
      {
        id: "src/api.ts:handleRequest",
        name: "handleRequest",
        type: "Function",
        package: "test",
        filePath: "src/api.ts",
        startLine: 1,
        endLine: 10,
        exported: true,
      },
      {
        id: "src/db.ts:saveData",
        name: "saveData",
        type: "Function",
        package: "test",
        filePath: "src/db.ts",
        startLine: 1,
        endLine: 10,
        exported: true,
      },
    ]);

    // Insert test edge
    await writer.addEdges([
      {
        source: "src/api.ts:handleRequest",
        target: "src/db.ts:saveData",
        type: "CALLS",
      },
    ]);
  });

  afterAll(() => {
    closeDatabase(db);
  });

  it("includes parentheses for start node function in mermaid output", () => {
    const output = dependenciesOf(
      db,
      projectRoot,
      "src/api.ts",
      "handleRequest",
      { format: "mermaid" },
    );

    // Start node (handleRequest) should show "()" since it's a Function
    expect(output).toContain('["handleRequest()"]');
    // Target node should also show "()"
    expect(output).toContain('["saveData()"]');
  });
});
