import assert from "node:assert";
import type Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createSqliteWriter } from "../db/sqlite/createSqliteWriter.js";
import {
  closeDatabase,
  openDatabase,
} from "../db/sqlite/sqliteConnection.utils.js";
import { initializeSchema } from "../db/sqlite/sqliteSchema.utils.js";
import type { FunctionNode, InterfaceNode } from "../db/Types.js";
import { createFakeEmbeddingCache } from "../embedding/createFakeEmbeddingCache.js";
import { createFakeEmbeddingProvider } from "../embedding/createFakeEmbeddingProvider.js";
import { createSearchIndex } from "./createSearchIndex.js";
import { populateSearchIndex } from "./populateSearchIndex.js";

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
});

const iface = (name: string, file = "src/types.ts"): InterfaceNode => ({
  id: `${file}:${name}`,
  type: "Interface",
  name,
  package: "main",
  filePath: file,
  startLine: 1,
  endLine: 5,
  exported: true,
  contentHash: `hash-${name}`,
});

const vectorDimensions = 3;

describe(populateSearchIndex.name, () => {
  let db: Database.Database;
  const embeddingCache = createFakeEmbeddingCache(vectorDimensions);
  const embeddingProvider = createFakeEmbeddingProvider({
    dimensions: vectorDimensions,
  });
  const projectRoot = "/test/project";

  beforeEach(() => {
    db = openDatabase({ path: ":memory:" });
    initializeSchema(db);
  });

  afterEach(() => {
    closeDatabase(db);
  });

  it("returns 0 for empty database", async () => {
    const searchIndex = await createSearchIndex({ vectorDimensions });
    const result = await populateSearchIndex({
      db,
      searchIndex,
      embeddingCache,
      embeddingProvider,
      projectRoot,
    });
    expect(result.total).toBe(0);
    expect(await searchIndex.count()).toBe(0);
  });

  it("loads all nodes into search index", async () => {
    const writer = createSqliteWriter(db);
    await writer.addNodes([
      fn("validateInput"),
      fn("processData"),
      iface("User"),
    ]);

    const searchIndex = await createSearchIndex({ vectorDimensions });
    const result = await populateSearchIndex({
      db,
      searchIndex,
      embeddingCache,
      embeddingProvider,
      projectRoot,
    });

    expect(result.total).toBe(3);
    expect(await searchIndex.count()).toBe(3);
  });

  it("allows searching loaded nodes by symbol name", async () => {
    const writer = createSqliteWriter(db);
    await writer.addNodes([
      fn("validateInput"),
      fn("processData"),
      fn("validateOutput"),
    ]);

    const searchIndex = await createSearchIndex({ vectorDimensions });
    await populateSearchIndex({
      db,
      searchIndex,
      embeddingCache,
      embeddingProvider,
      projectRoot,
    });

    const results = await searchIndex.search("validate");
    expect(results).toHaveLength(2);
    expect(results.map((r) => r.symbol)).toContain("validateInput");
    expect(results.map((r) => r.symbol)).toContain("validateOutput");
  });

  it("allows searching by split camelCase terms", async () => {
    const writer = createSqliteWriter(db);
    await writer.addNodes([fn("handleUserRequest")]);

    const searchIndex = await createSearchIndex({ vectorDimensions });
    await populateSearchIndex({
      db,
      searchIndex,
      embeddingCache,
      embeddingProvider,
      projectRoot,
    });

    // Should find by "User" because camelCase is split
    const results = await searchIndex.search("User");
    expect(results).toHaveLength(1);
    assert(results[0] !== undefined);
    expect(results[0].symbol).toBe("handleUserRequest");
  });

  it("handles large datasets in batches", async () => {
    const writer = createSqliteWriter(db);
    const nodes = Array.from({ length: 1000 }, (_, i) => fn(`func${i}`));
    await writer.addNodes(nodes);

    const searchIndex = await createSearchIndex({ vectorDimensions });
    const result = await populateSearchIndex({
      db,
      searchIndex,
      embeddingCache,
      embeddingProvider,
      projectRoot,
    });

    expect(result.total).toBe(1000);
    expect(await searchIndex.count()).toBe(1000);
  });
});
