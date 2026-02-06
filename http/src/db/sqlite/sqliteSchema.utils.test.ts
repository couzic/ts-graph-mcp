import type Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DB_SCHEMA_VERSION } from "../versions.js";
import { closeDatabase, openDatabase } from "./sqliteConnection.utils.js";
import { initializeSchema } from "./sqliteSchema.utils.js";

describe(initializeSchema.name, () => {
  let db: Database.Database;

  beforeEach(() => {
    db = openDatabase({ path: ":memory:" });
  });

  afterEach(() => {
    closeDatabase(db);
  });

  it("creates tables on a fresh database", () => {
    initializeSchema(db);

    const tables = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name",
      )
      .all() as Array<{ name: string }>;
    const tableNames = tables.map((t) => t.name);

    expect(tableNames).toContain("nodes");
    expect(tableNames).toContain("edges");
  });

  it("sets the schema version", () => {
    initializeSchema(db);

    const version = (
      db.pragma("user_version") as Array<{ user_version: number }>
    )[0]?.user_version;

    expect(version).toBe(DB_SCHEMA_VERSION);
  });

  it("drops and recreates tables when schema version is outdated", () => {
    // Setup: create tables at an older version with some data
    initializeSchema(db);
    db.exec(
      "INSERT INTO nodes (id, type, name, package, file_path, start_line, end_line, exported, content_hash, snippet) VALUES ('test:fn', 'Function', 'fn', 'main', 'test.ts', 1, 5, 1, 'hash', 'function fn() {}')",
    );
    db.exec(
      "INSERT INTO edges (source, target, type) VALUES ('test:fn', 'test:other', 'CALLS')",
    );

    // Simulate an outdated schema by lowering user_version below current
    db.pragma("user_version = 0");

    // Act: reinitialize — should drop and recreate
    initializeSchema(db);

    // Verify: tables exist but data was wiped
    const nodeCount = (
      db.prepare("SELECT COUNT(*) as count FROM nodes").get() as {
        count: number;
      }
    ).count;
    const edgeCount = (
      db.prepare("SELECT COUNT(*) as count FROM edges").get() as {
        count: number;
      }
    ).count;

    expect(nodeCount).toBe(0);
    expect(edgeCount).toBe(0);
  });
});
