import type Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  closeDatabase,
  openDatabase,
} from "../../db/sqlite/sqliteConnection.utils.js";
import { initializeSchema } from "../../db/sqlite/sqliteSchema.utils.js";
import { connectSeeds } from "./connectSeeds.js";

const insertNode = (db: Database.Database, id: string, name: string): void => {
  db.prepare(
    `INSERT INTO nodes (id, name, type, package, file_path, start_line, end_line, exported, content_hash, snippet)
     VALUES (?, ?, 'Function', 'test', 'src/test.ts', 1, 10, 1, ?, ?)`,
  ).run(id, name, `hash-${name}`, `function ${name}() {}`);
};

const insertEdge = (
  db: Database.Database,
  source: string,
  target: string,
  type = "CALLS",
): void => {
  db.prepare(`INSERT INTO edges (source, target, type) VALUES (?, ?, ?)`).run(
    source,
    target,
    type,
  );
};

describe("connectSeeds", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = openDatabase({ path: ":memory:" });
    initializeSchema(db);
  });

  afterEach(() => {
    closeDatabase(db);
  });

  it("returns direct edge between two seeds", () => {
    insertNode(db, "src/a.ts:fnA", "fnA");
    insertNode(db, "src/b.ts:fnB", "fnB");
    insertEdge(db, "src/a.ts:fnA", "src/b.ts:fnB");

    const result = connectSeeds(db, ["src/a.ts:fnA", "src/b.ts:fnB"]);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      source: "src/a.ts:fnA",
      target: "src/b.ts:fnB",
      type: "CALLS",
    });
  });

  it("finds intermediate node connecting two seeds", () => {
    // A → X → B, seeds are {A, B}, X is the bridge
    insertNode(db, "src/a.ts:fnA", "fnA");
    insertNode(db, "src/x.ts:fnX", "fnX");
    insertNode(db, "src/b.ts:fnB", "fnB");
    insertEdge(db, "src/a.ts:fnA", "src/x.ts:fnX");
    insertEdge(db, "src/x.ts:fnX", "src/b.ts:fnB");

    const result = connectSeeds(db, ["src/a.ts:fnA", "src/b.ts:fnB"]);

    expect(result).toHaveLength(2);
    const sources = result.map((e) => e.source);
    const targets = result.map((e) => e.target);
    expect(sources).toContain("src/a.ts:fnA");
    expect(targets).toContain("src/x.ts:fnX");
    expect(sources).toContain("src/x.ts:fnX");
    expect(targets).toContain("src/b.ts:fnB");
  });

  it("returns empty array when seeds have no path between them", () => {
    // A → X, B → Y — completely disconnected
    insertNode(db, "src/a.ts:fnA", "fnA");
    insertNode(db, "src/x.ts:fnX", "fnX");
    insertNode(db, "src/b.ts:fnB", "fnB");
    insertNode(db, "src/y.ts:fnY", "fnY");
    insertEdge(db, "src/a.ts:fnA", "src/x.ts:fnX");
    insertEdge(db, "src/b.ts:fnB", "src/y.ts:fnY");

    const result = connectSeeds(db, ["src/a.ts:fnA", "src/b.ts:fnB"]);

    expect(result).toHaveLength(0);
  });

  it("connects three seeds through a shared bridge", () => {
    // A → X, B → X, C → X — X is the hub
    insertNode(db, "src/a.ts:fnA", "fnA");
    insertNode(db, "src/b.ts:fnB", "fnB");
    insertNode(db, "src/c.ts:fnC", "fnC");
    insertNode(db, "src/x.ts:fnX", "fnX");
    insertEdge(db, "src/a.ts:fnA", "src/x.ts:fnX");
    insertEdge(db, "src/b.ts:fnB", "src/x.ts:fnX");
    insertEdge(db, "src/c.ts:fnC", "src/x.ts:fnX");

    const result = connectSeeds(db, [
      "src/a.ts:fnA",
      "src/b.ts:fnB",
      "src/c.ts:fnC",
    ]);

    expect(result).toHaveLength(3);
    // All three edges should point to X
    for (const edge of result) {
      expect(edge.target).toBe("src/x.ts:fnX");
    }
  });

  it("respects depth limit", () => {
    // A → X1 → X2 → X3 → X4 → B — 5 hops, too far for depth 3
    insertNode(db, "src/a.ts:fnA", "fnA");
    insertNode(db, "src/x1.ts:fnX1", "fnX1");
    insertNode(db, "src/x2.ts:fnX2", "fnX2");
    insertNode(db, "src/x3.ts:fnX3", "fnX3");
    insertNode(db, "src/x4.ts:fnX4", "fnX4");
    insertNode(db, "src/b.ts:fnB", "fnB");
    insertEdge(db, "src/a.ts:fnA", "src/x1.ts:fnX1");
    insertEdge(db, "src/x1.ts:fnX1", "src/x2.ts:fnX2");
    insertEdge(db, "src/x2.ts:fnX2", "src/x3.ts:fnX3");
    insertEdge(db, "src/x3.ts:fnX3", "src/x4.ts:fnX4");
    insertEdge(db, "src/x4.ts:fnX4", "src/b.ts:fnB");

    const result = connectSeeds(db, ["src/a.ts:fnA", "src/b.ts:fnB"], {
      maxDepth: 3,
    });

    expect(result).toHaveLength(0);
  });

  it("returns empty array for single seed", () => {
    insertNode(db, "src/a.ts:fnA", "fnA");

    const result = connectSeeds(db, ["src/a.ts:fnA"]);

    expect(result).toHaveLength(0);
  });

  it("returns empty array for empty seed list", () => {
    const result = connectSeeds(db, []);

    expect(result).toHaveLength(0);
  });

  it("handles cycles without infinite recursion", () => {
    // A → X → Y → X (cycle), B → Y — X and Y form a cycle
    insertNode(db, "src/a.ts:fnA", "fnA");
    insertNode(db, "src/b.ts:fnB", "fnB");
    insertNode(db, "src/x.ts:fnX", "fnX");
    insertNode(db, "src/y.ts:fnY", "fnY");
    insertEdge(db, "src/a.ts:fnA", "src/x.ts:fnX");
    insertEdge(db, "src/x.ts:fnX", "src/y.ts:fnY");
    insertEdge(db, "src/y.ts:fnY", "src/x.ts:fnX"); // cycle
    insertEdge(db, "src/b.ts:fnB", "src/y.ts:fnY");

    const result = connectSeeds(db, ["src/a.ts:fnA", "src/b.ts:fnB"]);

    // Y is reachable from both seeds → meeting point
    expect(result.length).toBeGreaterThan(0);
    const nodeIds = new Set(result.flatMap((e) => [e.source, e.target]));
    expect(nodeIds).toContain("src/y.ts:fnY");
  });
});
