import type { Database } from "better-sqlite3";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  closeDatabase,
  openDatabase,
} from "../../db/sqlite/sqliteConnection.utils.js";
import { initializeSchema } from "../../db/sqlite/sqliteSchema.utils.js";
import { attemptClassMethodFallback } from "./classMethodFallback.js";

const insertNode = (
  db: Database,
  id: string,
  name: string,
  type: string,
  filePath: string,
) => {
  db.prepare(
    `INSERT INTO nodes (id, name, type, package, file_path, start_line, end_line, exported) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, name, type, "test", filePath, 1, 10, 1);
};

const insertEdge = (db: Database, source: string, target: string, type: string) => {
  db.prepare(`INSERT INTO edges (source, target, type) VALUES (?, ?, ?)`).run(
    source,
    target,
    type,
  );
};

/**
 * Integration tests for attemptClassMethodFallback with real in-memory database.
 */
describe("attemptClassMethodFallback integration", () => {
  let db: Database;

  beforeAll(() => {
    db = openDatabase({ path: ":memory:" });
    initializeSchema(db);

    // 1. A function node (not a class)
    insertNode(db, "src/utils.ts:formatDate", "formatDate", "Function", "src/utils.ts");

    // 2. A class with no methods
    insertNode(db, "src/empty.ts:EmptyClass", "EmptyClass", "Class", "src/empty.ts");

    // 3. A class with 1 method that HAS dependencies
    insertNode(db, "src/single.ts:SingleMethodClass", "SingleMethodClass", "Class", "src/single.ts");
    insertNode(db, "src/single.ts:SingleMethodClass.execute", "execute", "Method", "src/single.ts");
    insertEdge(db, "src/single.ts:SingleMethodClass.execute", "src/utils.ts:formatDate", "CALLS");

    // 4. A class with 1 method that has NO dependencies
    insertNode(db, "src/noDeps.ts:NoDepMethodClass", "NoDepMethodClass", "Class", "src/noDeps.ts");
    insertNode(db, "src/noDeps.ts:NoDepMethodClass.doNothing", "doNothing", "Method", "src/noDeps.ts");

    // 5. A class with multiple methods
    insertNode(db, "src/multi.ts:MultiMethodClass", "MultiMethodClass", "Class", "src/multi.ts");
    insertNode(db, "src/multi.ts:MultiMethodClass.methodA", "methodA", "Method", "src/multi.ts");
    insertNode(db, "src/multi.ts:MultiMethodClass.methodB", "methodB", "Method", "src/multi.ts");
    insertEdge(db, "src/multi.ts:MultiMethodClass.methodA", "src/utils.ts:formatDate", "CALLS");
    insertEdge(db, "src/multi.ts:MultiMethodClass.methodB", "src/utils.ts:formatDate", "CALLS");
  });

  afterAll(() => {
    closeDatabase(db);
  });

  it("returns not-a-class for function nodes", () => {
    const result = attemptClassMethodFallback(db, "src/utils.ts:formatDate");

    expect(result).toEqual({ type: "not-a-class" });
  });

  it("returns no-methods for class with no methods", () => {
    const result = attemptClassMethodFallback(db, "src/empty.ts:EmptyClass");

    expect(result).toEqual({ type: "no-methods" });
  });

  it("returns single-method for class with exactly one method that has dependencies", () => {
    const result = attemptClassMethodFallback(
      db,
      "src/single.ts:SingleMethodClass",
    );

    expect(result).toEqual({
      type: "single-method",
      methodId: "src/single.ts:SingleMethodClass.execute",
      methodName: "execute",
    });
  });

  it("returns multiple-methods for class with one method that has NO dependencies", () => {
    const result = attemptClassMethodFallback(
      db,
      "src/noDeps.ts:NoDepMethodClass",
    );

    expect(result).toEqual({
      type: "multiple-methods",
      methods: [
        {
          id: "src/noDeps.ts:NoDepMethodClass.doNothing",
          name: "doNothing",
          hasDependencies: false,
        },
      ],
    });
  });

  it("returns multiple-methods for class with multiple methods", () => {
    const result = attemptClassMethodFallback(db, "src/multi.ts:MultiMethodClass");

    expect(result).toEqual({
      type: "multiple-methods",
      methods: [
        {
          id: "src/multi.ts:MultiMethodClass.methodA",
          name: "methodA",
          hasDependencies: true,
        },
        {
          id: "src/multi.ts:MultiMethodClass.methodB",
          name: "methodB",
          hasDependencies: true,
        },
      ],
    });
  });
});
