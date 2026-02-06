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
    `INSERT INTO nodes (id, name, type, package, file_path, start_line, end_line, exported, content_hash, snippet) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    name,
    type,
    "test",
    filePath,
    1,
    10,
    1,
    `hash-${name}`,
    `${type} ${name}`,
  );
};

const insertEdge = (
  db: Database,
  source: string,
  target: string,
  type: string,
) => {
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
    insertNode(
      db,
      "src/utils.ts:Function:formatDate",
      "formatDate",
      "Function",
      "src/utils.ts",
    );

    // 2. A class with no methods
    insertNode(
      db,
      "src/empty.ts:Class:EmptyClass",
      "EmptyClass",
      "Class",
      "src/empty.ts",
    );

    // 3. A class with 1 method that HAS dependencies
    insertNode(
      db,
      "src/single.ts:Class:SingleMethodClass",
      "SingleMethodClass",
      "Class",
      "src/single.ts",
    );
    insertNode(
      db,
      "src/single.ts:Method:SingleMethodClass.execute",
      "execute",
      "Method",
      "src/single.ts",
    );
    insertEdge(
      db,
      "src/single.ts:Method:SingleMethodClass.execute",
      "src/utils.ts:Function:formatDate",
      "CALLS",
    );

    // 4. A class with 1 method that has NO dependencies
    insertNode(
      db,
      "src/noDeps.ts:Class:NoDepMethodClass",
      "NoDepMethodClass",
      "Class",
      "src/noDeps.ts",
    );
    insertNode(
      db,
      "src/noDeps.ts:Method:NoDepMethodClass.doNothing",
      "doNothing",
      "Method",
      "src/noDeps.ts",
    );

    // 5. A class with multiple methods
    insertNode(
      db,
      "src/multi.ts:Class:MultiMethodClass",
      "MultiMethodClass",
      "Class",
      "src/multi.ts",
    );
    insertNode(
      db,
      "src/multi.ts:Method:MultiMethodClass.methodA",
      "methodA",
      "Method",
      "src/multi.ts",
    );
    insertNode(
      db,
      "src/multi.ts:Method:MultiMethodClass.methodB",
      "methodB",
      "Method",
      "src/multi.ts",
    );
    insertEdge(
      db,
      "src/multi.ts:Method:MultiMethodClass.methodA",
      "src/utils.ts:Function:formatDate",
      "CALLS",
    );
    insertEdge(
      db,
      "src/multi.ts:Method:MultiMethodClass.methodB",
      "src/utils.ts:Function:formatDate",
      "CALLS",
    );
  });

  afterAll(() => {
    closeDatabase(db);
  });

  it("returns not-a-class for function nodes", () => {
    const result = attemptClassMethodFallback(
      db,
      "src/utils.ts:Function:formatDate",
    );

    expect(result).toEqual({ type: "not-a-class" });
  });

  it("returns no-methods for class with no methods", () => {
    const result = attemptClassMethodFallback(
      db,
      "src/empty.ts:Class:EmptyClass",
    );

    expect(result).toEqual({ type: "no-methods" });
  });

  // Tests for class method fallback with 3-part node IDs.
  // Class ID: path:Class:ClassName
  // Method ID: path:Method:ClassName.methodName

  it("returns single-method for class with one method that has deps", () => {
    const result = attemptClassMethodFallback(
      db,
      "src/single.ts:Class:SingleMethodClass",
    );

    expect(result).toEqual({
      type: "single-method",
      methodId: "src/single.ts:Method:SingleMethodClass.execute",
      methodName: "execute",
    });
  });

  it("returns no-methods for class with one method that has no deps", () => {
    // Method exists but has no dependencies, so no method qualifies for auto-resolution
    const result = attemptClassMethodFallback(
      db,
      "src/noDeps.ts:Class:NoDepMethodClass",
    );

    // findClassMethods returns 1 method, but it has no deps,
    // so methodsWithDeps is empty, returning multiple-methods (empty list)
    expect(result).toEqual({
      type: "multiple-methods",
      methods: [
        {
          id: "src/noDeps.ts:Method:NoDepMethodClass.doNothing",
          name: "doNothing",
          hasDependencies: false,
        },
      ],
    });
  });

  it("returns multiple-methods for class with multiple methods", () => {
    const result = attemptClassMethodFallback(
      db,
      "src/multi.ts:Class:MultiMethodClass",
    );

    expect(result).toEqual({
      type: "multiple-methods",
      methods: [
        {
          id: "src/multi.ts:Method:MultiMethodClass.methodA",
          name: "methodA",
          hasDependencies: true,
        },
        {
          id: "src/multi.ts:Method:MultiMethodClass.methodB",
          name: "methodB",
          hasDependencies: true,
        },
      ],
    });
  });
});
