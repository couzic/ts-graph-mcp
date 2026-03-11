import type Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createSqliteWriter } from "../../db/sqlite/createSqliteWriter.js";
import {
  closeDatabase,
  openDatabase,
} from "../../db/sqlite/sqliteConnection.utils.js";
import { initializeSchema } from "../../db/sqlite/sqliteSchema.utils.js";
import type {
  ClassNode,
  Edge,
  FunctionNode,
  InterfaceNode,
} from "../../db/Types.js";
import { createFakeEmbeddingProvider } from "../../embedding/createFakeEmbeddingProvider.js";
import { formatMcpFromResult } from "../shared/formatFromResult.js";
import type { QueryResult } from "../shared/QueryResult.js";
import { searchGraph } from "./searchGraph.js";

const toMcp = (result: QueryResult): string => formatMcpFromResult(result);

const fn = (name: string, file = "src/test.ts"): FunctionNode => ({
  id: `${file}:Function:${name}`,
  type: "Function",
  name,
  package: "main",
  filePath: file,
  startLine: 1,
  endLine: 10,
  exported: true,
  contentHash: `hash-${name}`,
  snippet: `function ${name}() { return true; }`,
});

const iface = (name: string, file = "src/test.ts"): InterfaceNode => ({
  id: `${file}:Interface:${name}`,
  type: "Interface",
  name,
  package: "main",
  filePath: file,
  startLine: 1,
  endLine: 10,
  exported: true,
  contentHash: `hash-${name}`,
  snippet: `interface ${name} {}`,
});

const cls = (name: string, file = "src/test.ts"): ClassNode => ({
  id: `${file}:Class:${name}`,
  type: "Class",
  name,
  package: "main",
  filePath: file,
  startLine: 1,
  endLine: 10,
  exported: true,
  contentHash: `hash-${name}`,
  snippet: `class ${name} {}`,
});

const calls = (from: string, to: string): Edge => ({
  source: from,
  target: to,
  type: "CALLS",
});

const takes = (from: string, to: string): Edge => ({
  source: from,
  target: to,
  type: "TAKES",
});

const implements_ = (from: string, to: string): Edge => ({
  source: from,
  target: to,
  type: "IMPLEMENTS",
});

const extends_ = (from: string, to: string): Edge => ({
  source: from,
  target: to,
  type: "EXTENDS",
});

const vectorDimensions = 3;

/**
 * Tests for bidirectional IMPLEMENTS/EXTENDS traversal and edge priority truncation.
 */
describe("bidirectional IMPLEMENTS/EXTENDS traversal", () => {
  let db: Database.Database;
  const embeddingProvider = createFakeEmbeddingProvider({
    dimensions: vectorDimensions,
  });

  beforeEach(() => {
    db = openDatabase({ path: ":memory:" });
    initializeSchema(db);
  });

  afterEach(() => {
    closeDatabase(db);
  });

  /** @spec tool::query.bidirectional-implements-extends */
  describe("forward traversal discovers implementations", () => {
    it("finds class that implements interface reachable via TAKES", async () => {
      const writer = createSqliteWriter(db);
      const functionF = fn("functionF");
      const interfaceI = iface("InterfaceI");
      const classC = cls("ClassC");

      await writer.addNodes([functionF, interfaceI, classC]);
      await writer.addEdges([
        takes(functionF.id, interfaceI.id),
        implements_(classC.id, interfaceI.id),
      ]);

      const result = await searchGraph(
        db,
        { from: { symbol: "functionF" } },
        { embeddingProvider },
      );

      const output = toMcp(result);
      expect(output).toContain("InterfaceI");
      expect(output).toContain("ClassC");
      expect(output).toContain("IMPLEMENTS");
    });

    it("finds subclass via reverse EXTENDS from base class", async () => {
      const writer = createSqliteWriter(db);
      const functionF = fn("functionF");
      const baseClass = cls("BaseClass");
      const childClass = cls("ChildClass", "src/child.ts");

      await writer.addNodes([functionF, baseClass, childClass]);
      await writer.addEdges([
        calls(functionF.id, baseClass.id),
        extends_(childClass.id, baseClass.id),
      ]);

      const result = await searchGraph(
        db,
        { from: { symbol: "functionF" } },
        { embeddingProvider },
      );

      const output = toMcp(result);
      expect(output).toContain("BaseClass");
      expect(output).toContain("ChildClass");
      expect(output).toContain("EXTENDS");
    });
  });

  /** @spec tool::query.bidirectional-implements-extends */
  describe("backward traversal discovers interface consumers", () => {
    it("finds function that takes interface implemented by queried class", async () => {
      const writer = createSqliteWriter(db);
      const functionF = fn("functionF");
      const interfaceI = iface("InterfaceI");
      const classC = cls("ClassC");

      await writer.addNodes([functionF, interfaceI, classC]);
      await writer.addEdges([
        takes(functionF.id, interfaceI.id),
        implements_(classC.id, interfaceI.id),
      ]);

      const result = await searchGraph(
        db,
        { to: { symbol: "ClassC" } },
        { embeddingProvider },
      );

      const output = toMcp(result);
      expect(output).toContain("functionF");
      expect(output).toContain("InterfaceI");
    });

    it("finds caller of base class when querying subclass via EXTENDS", async () => {
      const writer = createSqliteWriter(db);
      const functionF = fn("functionF");
      const baseClass = cls("BaseClass");
      const childClass = cls("ChildClass", "src/child.ts");

      await writer.addNodes([functionF, baseClass, childClass]);
      await writer.addEdges([
        calls(functionF.id, baseClass.id),
        extends_(childClass.id, baseClass.id),
      ]);

      const result = await searchGraph(
        db,
        { to: { symbol: "ChildClass" } },
        { embeddingProvider },
      );

      const output = toMcp(result);
      expect(output).toContain("functionF");
      expect(output).toContain("BaseClass");
    });
  });

  /** @spec tool::query.bidirectional-implements-extends */
  describe("path finding through interfaces", () => {
    it("finds path from function to class through shared interface", async () => {
      const writer = createSqliteWriter(db);
      const functionF = fn("functionF");
      const interfaceI = iface("InterfaceI");
      const classC = cls("ClassC");

      await writer.addNodes([functionF, interfaceI, classC]);
      await writer.addEdges([
        takes(functionF.id, interfaceI.id),
        implements_(classC.id, interfaceI.id),
      ]);

      const result = await searchGraph(
        db,
        { from: { symbol: "functionF" }, to: { symbol: "ClassC" } },
        { embeddingProvider },
      );

      const output = toMcp(result);
      expect(output).toContain("functionF");
      expect(output).toContain("InterfaceI");
      expect(output).toContain("ClassC");
      expect(output).toContain("TAKES");
      expect(output).toContain("IMPLEMENTS");
    });

    it("finds path from function to subclass through base class", async () => {
      const writer = createSqliteWriter(db);
      const functionF = fn("functionF");
      const baseClass = cls("BaseClass");
      const childClass = cls("ChildClass", "src/child.ts");

      await writer.addNodes([functionF, baseClass, childClass]);
      await writer.addEdges([
        calls(functionF.id, baseClass.id),
        extends_(childClass.id, baseClass.id),
      ]);

      const result = await searchGraph(
        db,
        { from: { symbol: "functionF" }, to: { symbol: "ChildClass" } },
        { embeddingProvider },
      );

      const output = toMcp(result);
      expect(output).toContain("functionF");
      expect(output).toContain("BaseClass");
      expect(output).toContain("ChildClass");
    });
  });
});

/** @spec tool::query.edge-priority-truncation */
describe("edge priority truncation", () => {
  let db: Database.Database;
  const embeddingProvider = createFakeEmbeddingProvider({
    dimensions: vectorDimensions,
  });

  beforeEach(() => {
    db = openDatabase({ path: ":memory:" });
    initializeSchema(db);
  });

  afterEach(() => {
    closeDatabase(db);
  });

  it("keeps CALLS nodes over reverse IMPLEMENTS nodes when truncating", async () => {
    const writer = createSqliteWriter(db);
    // functionF CALLS helperA, helperB
    // functionF TAKES InterfaceI
    // ClassC, ClassD IMPLEMENTS InterfaceI
    const functionF = fn("functionF");
    const helperA = fn("helperA", "src/helperA.ts");
    const helperB = fn("helperB", "src/helperB.ts");
    const interfaceI = iface("InterfaceI", "src/types.ts");
    const classC = cls("ClassC", "src/classC.ts");
    const classD = cls("ClassD", "src/classD.ts");

    await writer.addNodes([
      functionF,
      helperA,
      helperB,
      interfaceI,
      classC,
      classD,
    ]);
    await writer.addEdges([
      calls(functionF.id, helperA.id),
      calls(functionF.id, helperB.id),
      takes(functionF.id, interfaceI.id),
      implements_(classC.id, interfaceI.id),
      implements_(classD.id, interfaceI.id),
    ]);

    // max_nodes=5: functionF + helperA + helperB + InterfaceI = 4 high-priority
    // ClassC and ClassD are low-priority (reverse IMPLEMENTS)
    // Only room for 1 more — should keep at most one implementation
    const result = await searchGraph(
      db,
      { from: { symbol: "functionF" }, max_nodes: 5 },
      { embeddingProvider },
    );

    const output = toMcp(result);
    // High-priority nodes must be present
    expect(output).toContain("helperA");
    expect(output).toContain("helperB");
    expect(output).toContain("InterfaceI");
  });
});

/** @spec tool::output.truncation */
describe("BFS truncation keeps direct neighbors over deep descendants", () => {
  let db: Database.Database;
  const embeddingProvider = createFakeEmbeddingProvider({
    dimensions: vectorDimensions,
  });

  beforeEach(() => {
    db = openDatabase({ path: ":memory:" });
    initializeSchema(db);
  });

  afterEach(() => {
    closeDatabase(db);
  });

  it("keeps all direct calls before following deep chains", async () => {
    const writer = createSqliteWriter(db);
    // root calls directA, directB, directC
    // directA calls deep1, deep1 calls deep2, deep2 calls deep3
    const root = fn("root");
    const directA = fn("directA", "src/directA.ts");
    const directB = fn("directB", "src/directB.ts");
    const directC = fn("directC", "src/directC.ts");
    const deep1 = fn("deep1", "src/deep1.ts");
    const deep2 = fn("deep2", "src/deep2.ts");
    const deep3 = fn("deep3", "src/deep3.ts");

    await writer.addNodes([
      root,
      directA,
      directB,
      directC,
      deep1,
      deep2,
      deep3,
    ]);
    await writer.addEdges([
      calls(root.id, directA.id),
      calls(root.id, directB.id),
      calls(root.id, directC.id),
      calls(directA.id, deep1.id),
      calls(deep1.id, deep2.id),
      calls(deep2.id, deep3.id),
    ]);

    // max_nodes=5: root + directA + directB + directC + deep1
    // BFS should keep all direct calls before deep chain
    const result = await searchGraph(
      db,
      { from: { symbol: "root" }, max_nodes: 5 },
      { embeddingProvider },
    );

    const output = toMcp(result);
    expect(output).toContain("directA");
    expect(output).toContain("directB");
    expect(output).toContain("directC");
    // deep2 and deep3 should be truncated
    expect(output).not.toContain("deep3");
  });
});
