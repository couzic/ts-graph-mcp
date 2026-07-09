import { existsSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  closeDatabase,
  openDatabase,
} from "./sqlite/sqliteConnection.utils.js";
import { DB_SCHEMA_VERSION, readSchemaVersion } from "./versions.js";

describe(readSchemaVersion.name, () => {
  let testDir: string;

  beforeEach(() => {
    testDir = join(tmpdir(), `versions-test-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it("reads the version an initialized database was stamped with", () => {
    const dbPath = join(testDir, "graph.db");
    closeDatabase(openDatabase({ path: dbPath }));

    expect(readSchemaVersion(dbPath)).toBe(DB_SCHEMA_VERSION);
  });

  /**
   * node:sqlite ignores unknown options, so a `readonly` typo would silently open
   * the DB read-write. A read-write open creates a missing file; read-only refuses.
   */
  it("opens the database read-only", () => {
    const missingPath = join(testDir, "missing.db");

    expect(() => readSchemaVersion(missingPath)).toThrow();
    expect(existsSync(missingPath)).toBe(false);
  });
});
