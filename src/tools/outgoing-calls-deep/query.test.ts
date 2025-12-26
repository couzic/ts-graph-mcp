import type Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createSqliteWriter } from "../../db/sqlite/createSqliteWriter.js";
import {
  closeDatabase,
  openDatabase,
} from "../../db/sqlite/sqliteConnection.utils.js";
import { initializeSchema } from "../../db/sqlite/sqliteSchema.utils.js";
import type { Edge, FunctionNode } from "../../db/Types.js";
import { queryCallees } from "./query.js";

// Test data factory - creates minimal function nodes
const fn = (
  name: string,
  file = "src/test.ts",
  module = "test",
): FunctionNode => ({
  id: `${file}:${name}`,
  type: "Function",
  name,
  module,
  package: "main",
  filePath: file,
  startLine: 1,
  endLine: 10,
  exported: true,
});

const calls = (from: string, to: string): Edge => ({
  source: from,
  target: to,
  type: "CALLS",
});

describe.skip(queryCallees.name, () => {
  let db: Database.Database;

  beforeEach(() => {
    db = openDatabase({ path: ":memory:" });
    initializeSchema(db);
  });

  afterEach(() => {
    closeDatabase(db);
  });

  it("returns empty array when node has no callees", async () => {
    const writer = createSqliteWriter(db);
    const nodeA = fn("a");
    await writer.addNodes([nodeA]);

    const result = queryCallees(db, nodeA.id);

    expect(result).toEqual([]);
  });

  it("returns direct callees", async () => {
    const writer = createSqliteWriter(db);
    const nodeA = fn("a");
    const nodeB = fn("b");
    await writer.addNodes([nodeA, nodeB]);
    await writer.addEdges([calls(nodeA.id, nodeB.id)]);

    const result = queryCallees(db, nodeA.id);

    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe(nodeB.id);
  });

  it("returns transitive callees", async () => {
    const writer = createSqliteWriter(db);
    const nodeA = fn("a");
    const nodeB = fn("b");
    const nodeC = fn("c");
    await writer.addNodes([nodeA, nodeB, nodeC]);
    await writer.addEdges([
      calls(nodeA.id, nodeB.id), // A → B
      calls(nodeB.id, nodeC.id), // B → C
    ]);

    const result = queryCallees(db, nodeA.id);

    expect(result).toHaveLength(2);
    const ids = result.map((n) => n.id);
    expect(ids).toContain(nodeB.id);
    expect(ids).toContain(nodeC.id);
  });

  it("respects maxDepth=1", async () => {
    const writer = createSqliteWriter(db);
    const nodeA = fn("a");
    const nodeB = fn("b");
    const nodeC = fn("c");
    await writer.addNodes([nodeA, nodeB, nodeC]);
    await writer.addEdges([
      calls(nodeA.id, nodeB.id), // A → B
      calls(nodeB.id, nodeC.id), // B → C
    ]);

    const result = queryCallees(db, nodeA.id, 1);

    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe(nodeB.id);
  });

  it("handles cycles without infinite loop", async () => {
    const writer = createSqliteWriter(db);
    const nodeA = fn("a");
    const nodeB = fn("b");
    await writer.addNodes([nodeA, nodeB]);
    await writer.addEdges([
      calls(nodeA.id, nodeB.id), // A → B
      calls(nodeB.id, nodeA.id), // B → A (cycle)
    ]);

    // Should complete without hanging
    // With cycle A↔B, callees of A = [B (direct), A (transitive via B)]
    const result = queryCallees(db, nodeA.id);

    expect(result).toHaveLength(2);
    const ids = result.map((n) => n.id);
    expect(ids).toContain(nodeA.id); // A is a transitive callee of itself
    expect(ids).toContain(nodeB.id);
  });

  it("ignores non-CALLS edges", async () => {
    const writer = createSqliteWriter(db);
    const nodeA = fn("a");
    const nodeB = fn("b");
    await writer.addNodes([nodeA, nodeB]);
    await writer.addEdges([
      { source: nodeA.id, target: nodeB.id, type: "USES_TYPE" }, // Not a CALLS edge
    ]);

    const result = queryCallees(db, nodeA.id);

    expect(result).toEqual([]);
  });
});
