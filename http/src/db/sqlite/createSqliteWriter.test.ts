import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Edge, FunctionNode, TestNode } from "../Types.js";
import { createSqliteReader } from "./createSqliteReader.js";
import { createSqliteWriter } from "./createSqliteWriter.js";
import type { SqliteDb } from "./SqliteDb.js";
import { closeDatabase, openDatabase } from "./sqliteConnection.utils.js";
import { initializeSchema } from "./sqliteSchema.utils.js";

const fn = (name: string, file = "src/test.ts"): FunctionNode => ({
  id: `${file}:${name}`,
  type: "Function",
  name,
  package: "main",
  filePath: file,
  startLine: 1,
  endLine: 10,
  exported: true,
  contentHash: `hash-${name}`,
  snippet: `function ${name}() {}`,
});

/** Test nodes are traceability nodes: they carry no `package`. */
const testNode = (name: string): TestNode => ({
  id: `src/a.test.ts:${name}`,
  type: "Test",
  name,
  filePath: "src/a.test.ts",
  startLine: 1,
  endLine: 3,
  exported: false,
  contentHash: `hash-${name}`,
  snippet: `it("${name}", () => {})`,
});

const calls = (from: string, to: string): Edge => ({
  source: from,
  target: to,
  type: "CALLS",
});

describe(createSqliteWriter.name, () => {
  let db: SqliteDb;

  beforeEach(() => {
    db = openDatabase({ path: ":memory:" });
    initializeSchema(db);
  });

  afterEach(() => {
    closeDatabase(db);
  });

  describe("addNodes", () => {
    it("persists a node that has no package", async () => {
      const writer = createSqliteWriter(db);
      const reader = createSqliteReader(db);

      await writer.addNodes([testNode("parses incomplete input")]);

      const stored = reader.getNode("src/a.test.ts:parses incomplete input");
      expect(stored?.name).toBe("parses incomplete input");
      // An absent package round-trips through the nullable `package` column.
      expect(stored?.package ?? null).toBeNull();
    });

    it("discards the whole batch when one node violates a constraint", async () => {
      const writer = createSqliteWriter(db);
      const reader = createSqliteReader(db);

      // `name` is NOT NULL in the nodes table.
      const invalid = { ...fn("invalid"), name: null as unknown as string };

      await expect(writer.addNodes([fn("valid"), invalid])).rejects.toThrow();
      expect(reader.getNode("src/test.ts:valid")).toBeNull();
    });
  });

  describe("addEdges", () => {
    it("discards the whole batch when one edge violates a constraint", async () => {
      const writer = createSqliteWriter(db);
      const reader = createSqliteReader(db);
      await writer.addNodes([fn("a"), fn("b")]);

      // `target` is NOT NULL in the edges table.
      const invalid = {
        ...calls("src/test.ts:a", "src/test.ts:b"),
        target: null as unknown as string,
      };
      const valid = calls("src/test.ts:a", "src/test.ts:b");

      await expect(writer.addEdges([valid, invalid])).rejects.toThrow();
      expect(reader.queryDependencies("src/test.ts:a")).toEqual([]);
    });
  });
});
