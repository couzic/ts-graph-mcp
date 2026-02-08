import type { Database } from "better-sqlite3";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  closeDatabase,
  openDatabase,
} from "../../db/sqlite/sqliteConnection.utils.js";
import { initializeSchema } from "../../db/sqlite/sqliteSchema.utils.js";
import { queryAliasMap } from "./queryAliasMap.js";

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

describe("queryAliasMap integration", () => {
  let db: Database;

  beforeAll(() => {
    db = openDatabase({ path: ":memory:" });
    initializeSchema(db);

    // SyntheticType node for factory return type
    insertNode(
      db,
      "src/service.ts:SyntheticType:ReturnType<typeof createService>",
      "ReturnType<typeof createService>",
      "SyntheticType",
      "src/service.ts",
    );

    // TypeAlias node that aliases the factory return type
    insertNode(
      db,
      "src/types.ts:TypeAlias:Service",
      "Service",
      "TypeAlias",
      "src/types.ts",
    );

    // ALIAS_FOR edge: Service -> SyntheticType
    insertEdge(
      db,
      "src/types.ts:TypeAlias:Service",
      "src/service.ts:SyntheticType:ReturnType<typeof createService>",
      "ALIAS_FOR",
    );

    // A factory method node
    insertNode(
      db,
      "src/service.ts:Function:ReturnType<typeof createService>.fetchAll",
      "ReturnType<typeof createService>.fetchAll",
      "Function",
      "src/service.ts",
    );

    // A second SyntheticType with no alias
    insertNode(
      db,
      "src/repo.ts:SyntheticType:ReturnType<typeof createRepo>",
      "ReturnType<typeof createRepo>",
      "SyntheticType",
      "src/repo.ts",
    );
  });

  afterAll(() => {
    closeDatabase(db);
  });

  it("returns alias map for node IDs containing synthetic prefixes", () => {
    const nodeIds = [
      "src/service.ts:Function:ReturnType<typeof createService>.fetchAll",
    ];

    const aliasMap = queryAliasMap(db, nodeIds);

    expect(aliasMap.size).toBe(1);
    expect(aliasMap.get("ReturnType<typeof createService>")).toBe("Service");
  });

  it("returns empty map when no node IDs contain synthetic prefixes", () => {
    const nodeIds = [
      "src/utils.ts:Function:formatDate",
      "src/models.ts:Interface:User",
    ];

    const aliasMap = queryAliasMap(db, nodeIds);

    expect(aliasMap.size).toBe(0);
  });

  it("returns empty map for empty node ID list", () => {
    const aliasMap = queryAliasMap(db, []);

    expect(aliasMap.size).toBe(0);
  });

  it("skips synthetic prefixes with no matching alias", () => {
    const nodeIds = ["src/repo.ts:Function:ReturnType<typeof createRepo>.save"];

    const aliasMap = queryAliasMap(db, nodeIds);

    expect(aliasMap.size).toBe(0);
  });

  it("handles mix of aliased and non-aliased prefixes", () => {
    const nodeIds = [
      "src/service.ts:Function:ReturnType<typeof createService>.fetchAll",
      "src/repo.ts:Function:ReturnType<typeof createRepo>.save",
      "src/utils.ts:Function:formatDate",
    ];

    const aliasMap = queryAliasMap(db, nodeIds);

    expect(aliasMap.size).toBe(1);
    expect(aliasMap.get("ReturnType<typeof createService>")).toBe("Service");
  });

  it("deduplicates prefixes from multiple node IDs", () => {
    const nodeIds = [
      "src/service.ts:Function:ReturnType<typeof createService>.fetchAll",
      "src/service.ts:Function:ReturnType<typeof createService>.fetchById",
    ];

    const aliasMap = queryAliasMap(db, nodeIds);

    expect(aliasMap.size).toBe(1);
    expect(aliasMap.get("ReturnType<typeof createService>")).toBe("Service");
  });
});
