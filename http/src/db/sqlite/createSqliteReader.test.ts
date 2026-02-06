import type Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Edge, FunctionNode } from "../Types.js";
import { createSqliteReader } from "./createSqliteReader.js";
import { createSqliteWriter } from "./createSqliteWriter.js";
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

const calls = (from: string, to: string): Edge => ({
  source: from,
  target: to,
  type: "CALLS",
});

describe(createSqliteReader.name, () => {
  let db: Database.Database;

  beforeEach(() => {
    db = openDatabase({ path: ":memory:" });
    initializeSchema(db);
  });

  afterEach(() => {
    closeDatabase(db);
  });

  describe("queryDependencies", () => {
    it("returns edges for forward traversal", async () => {
      const writer = createSqliteWriter(db);
      const reader = createSqliteReader(db);

      const nodeA = fn("fnA");
      const nodeB = fn("fnB");
      const nodeC = fn("fnC");

      // A → B → C
      await writer.addNodes([nodeA, nodeB, nodeC]);
      await writer.addEdges([
        calls(nodeA.id, nodeB.id),
        calls(nodeB.id, nodeC.id),
      ]);

      const result = reader.queryDependencies(nodeA.id);

      expect(result).toHaveLength(2);
      expect(result.map((e) => [e.source, e.target])).toContainEqual([
        nodeA.id,
        nodeB.id,
      ]);
      expect(result.map((e) => [e.source, e.target])).toContainEqual([
        nodeB.id,
        nodeC.id,
      ]);
    });

    it("returns empty array when no dependencies", async () => {
      const writer = createSqliteWriter(db);
      const reader = createSqliteReader(db);

      const nodeA = fn("fnA");
      await writer.addNodes([nodeA]);

      const result = reader.queryDependencies(nodeA.id);

      expect(result).toEqual([]);
    });

    it("respects maxDepth option", async () => {
      const writer = createSqliteWriter(db);
      const reader = createSqliteReader(db);

      const nodeA = fn("fnA");
      const nodeB = fn("fnB");
      const nodeC = fn("fnC");
      const nodeD = fn("fnD");

      // A → B → C → D
      await writer.addNodes([nodeA, nodeB, nodeC, nodeD]);
      await writer.addEdges([
        calls(nodeA.id, nodeB.id),
        calls(nodeB.id, nodeC.id),
        calls(nodeC.id, nodeD.id),
      ]);

      const result = reader.queryDependencies(nodeA.id, { maxDepth: 1 });

      expect(result).toHaveLength(1);
      expect(result[0]?.target).toBe(nodeB.id);
    });
  });

  describe("queryDependents", () => {
    it("returns edges for reverse traversal", async () => {
      const writer = createSqliteWriter(db);
      const reader = createSqliteReader(db);

      const nodeA = fn("fnA");
      const nodeB = fn("fnB");
      const nodeC = fn("fnC");

      // A → B → C
      await writer.addNodes([nodeA, nodeB, nodeC]);
      await writer.addEdges([
        calls(nodeA.id, nodeB.id),
        calls(nodeB.id, nodeC.id),
      ]);

      const result = reader.queryDependents(nodeC.id);

      expect(result).toHaveLength(2);
      expect(result.map((e) => [e.source, e.target])).toContainEqual([
        nodeA.id,
        nodeB.id,
      ]);
      expect(result.map((e) => [e.source, e.target])).toContainEqual([
        nodeB.id,
        nodeC.id,
      ]);
    });

    it("returns empty array when no dependents", async () => {
      const writer = createSqliteWriter(db);
      const reader = createSqliteReader(db);

      const nodeA = fn("fnA");
      await writer.addNodes([nodeA]);

      const result = reader.queryDependents(nodeA.id);

      expect(result).toEqual([]);
    });
  });

  describe("queryPaths", () => {
    it("finds direct path", async () => {
      const writer = createSqliteWriter(db);
      const reader = createSqliteReader(db);

      const nodeA = fn("fnA");
      const nodeB = fn("fnB");

      await writer.addNodes([nodeA, nodeB]);
      await writer.addEdges([calls(nodeA.id, nodeB.id)]);

      const result = reader.queryPaths(nodeA.id, nodeB.id);

      expect(result).toHaveLength(1);
      expect(result[0]?.nodes).toEqual([nodeA.id, nodeB.id]);
      expect(result[0]?.edges).toHaveLength(1);
    });

    it("finds multi-hop path", async () => {
      const writer = createSqliteWriter(db);
      const reader = createSqliteReader(db);

      const nodeA = fn("fnA");
      const nodeB = fn("fnB");
      const nodeC = fn("fnC");

      // A → B → C
      await writer.addNodes([nodeA, nodeB, nodeC]);
      await writer.addEdges([
        calls(nodeA.id, nodeB.id),
        calls(nodeB.id, nodeC.id),
      ]);

      const result = reader.queryPaths(nodeA.id, nodeC.id);

      expect(result).toHaveLength(1);
      expect(result[0]?.nodes).toEqual([nodeA.id, nodeB.id, nodeC.id]);
      expect(result[0]?.edges).toHaveLength(2);
    });

    it("returns empty array when no path exists", async () => {
      const writer = createSqliteWriter(db);
      const reader = createSqliteReader(db);

      const nodeA = fn("fnA");
      const nodeB = fn("fnB");

      await writer.addNodes([nodeA, nodeB]);

      const result = reader.queryPaths(nodeA.id, nodeB.id);

      expect(result).toEqual([]);
    });
  });

  describe("getNode", () => {
    it("returns node by ID", async () => {
      const writer = createSqliteWriter(db);
      const reader = createSqliteReader(db);

      const node = fn("myFunction");
      await writer.addNodes([node]);

      const result = reader.getNode(node.id);

      expect(result).not.toBeNull();
      expect(result?.id).toBe(node.id);
      expect(result?.name).toBe("myFunction");
      expect(result?.type).toBe("Function");
    });

    it("returns null for non-existent node", () => {
      const reader = createSqliteReader(db);

      const result = reader.getNode("nonexistent:node");

      expect(result).toBeNull();
    });
  });

  describe("getNodes", () => {
    it("returns multiple nodes", async () => {
      const writer = createSqliteWriter(db);
      const reader = createSqliteReader(db);

      const nodeA = fn("fnA");
      const nodeB = fn("fnB");
      await writer.addNodes([nodeA, nodeB]);

      const result = reader.getNodes([nodeA.id, nodeB.id]);

      expect(result).toHaveLength(2);
      expect(result.map((n) => n.id)).toContain(nodeA.id);
      expect(result.map((n) => n.id)).toContain(nodeB.id);
    });

    it("returns empty array for empty input", () => {
      const reader = createSqliteReader(db);

      const result = reader.getNodes([]);

      expect(result).toEqual([]);
    });

    it("omits non-existent nodes", async () => {
      const writer = createSqliteWriter(db);
      const reader = createSqliteReader(db);

      const nodeA = fn("fnA");
      await writer.addNodes([nodeA]);

      const result = reader.getNodes([nodeA.id, "nonexistent:node"]);

      expect(result).toHaveLength(1);
      expect(result[0]?.id).toBe(nodeA.id);
    });
  });

  describe("findNodesBySymbol", () => {
    it("finds node by exact name match", async () => {
      const writer = createSqliteWriter(db);
      const reader = createSqliteReader(db);

      const node = fn("formatDate");
      await writer.addNodes([node]);

      const result = reader.findNodesBySymbol("formatDate");

      expect(result).toHaveLength(1);
      expect(result[0]?.name).toBe("formatDate");
    });

    it("finds node by case-insensitive match", async () => {
      const writer = createSqliteWriter(db);
      const reader = createSqliteReader(db);

      const node = fn("FormatDate");
      await writer.addNodes([node]);

      const result = reader.findNodesBySymbol("formatdate");

      expect(result).toHaveLength(1);
      expect(result[0]?.name).toBe("FormatDate");
    });

    it("scopes search to file when filePath provided", async () => {
      const writer = createSqliteWriter(db);
      const reader = createSqliteReader(db);

      const nodeA = fn("formatDate", "src/utils.ts");
      const nodeB = fn("formatDate", "src/helpers.ts");
      await writer.addNodes([nodeA, nodeB]);

      const result = reader.findNodesBySymbol("formatDate", "src/utils.ts");

      expect(result).toHaveLength(1);
      expect(result[0]?.filePath).toBe("src/utils.ts");
    });

    it("returns empty array when symbol not found", () => {
      const reader = createSqliteReader(db);

      const result = reader.findNodesBySymbol("nonExistent");

      expect(result).toEqual([]);
    });
  });
});
