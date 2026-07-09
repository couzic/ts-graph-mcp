import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Edge, FunctionNode } from "../Types.js";
import { createSqliteReader } from "./createSqliteReader.js";
import { createSqliteWriter } from "./createSqliteWriter.js";
import { removeOrphanedEdges } from "./removeOrphanedEdges.js";
import type { SqliteDb } from "./SqliteDb.js";
import { closeDatabase, openDatabase } from "./sqliteConnection.utils.js";
import { initializeSchema } from "./sqliteSchema.utils.js";

const fn = (name: string): FunctionNode => ({
  id: `src/${name}.ts:${name}`,
  type: "Function",
  name,
  package: "main",
  filePath: `src/${name}.ts`,
  startLine: 1,
  endLine: 10,
  exported: true,
  contentHash: `hash-${name}`,
  snippet: `function ${name}() {}`,
});

const calls = (from: string, to: string): Edge => ({
  source: `src/${from}.ts:${from}`,
  target: `src/${to}.ts:${to}`,
  type: "CALLS",
});

describe(removeOrphanedEdges.name, () => {
  let db: SqliteDb;

  beforeEach(() => {
    db = openDatabase({ path: ":memory:" });
    initializeSchema(db);
  });

  afterEach(() => {
    closeDatabase(db);
  });

  /**
   * `removeFileNodes` drops a file's node and its outgoing edges, so deleting a
   * *target* file leaves the incoming edge pointing at a node that no longer exists.
   */
  const orphanEdgeFrom = async (db: SqliteDb) => {
    const writer = createSqliteWriter(db);
    await writer.addNodes([fn("a"), fn("b"), fn("gone")]);
    await writer.addEdges([calls("a", "b"), calls("a", "gone")]);
    await writer.removeFileNodes("src/gone.ts");
  };

  it("returns the number of edges removed", async () => {
    await orphanEdgeFrom(db);

    expect(removeOrphanedEdges(db)).toBe(1);
  });

  it("keeps edges whose target still exists", async () => {
    await orphanEdgeFrom(db);

    removeOrphanedEdges(db);

    const remaining = createSqliteReader(db).queryDependencies("src/a.ts:a");
    expect(remaining.map((edge) => edge.target)).toEqual(["src/b.ts:b"]);
  });

  it("returns zero when no edge is orphaned", async () => {
    await orphanEdgeFrom(db);
    removeOrphanedEdges(db);

    expect(removeOrphanedEdges(db)).toBe(0);
  });
});
