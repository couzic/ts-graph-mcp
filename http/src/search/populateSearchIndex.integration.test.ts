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
  snippet: `function ${name}() { return true; }`,
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
  snippet: `interface ${name} {}`,
});

const vectorDimensions = 3;

describe(populateSearchIndex.name, () => {
  let db: Database.Database;
  const embeddingCache = createFakeEmbeddingCache(vectorDimensions);
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

  it("returns 0 for empty database", async () => {
    const searchIndex = await createSearchIndex({ vectorDimensions });
    const result = await populateSearchIndex({
      db,
      searchIndex,
      embeddingCache,
      embeddingProvider,
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
    });

    // Should find by "User" because camelCase is split
    const results = await searchIndex.search("User");
    expect(results).toHaveLength(1);
    assert(results[0] !== undefined);
    expect(results[0].symbol).toBe("handleUserRequest");
  });

  it("handles cache miss for node that overflows embedding context", async () => {
    const maxContentLength = 200;
    const overflowProvider = createFakeEmbeddingProvider({
      dimensions: vectorDimensions,
      maxContentLength,
    });

    // Create a node with a snippet that exceeds the context limit
    const longSnippet = `function bigFunction() {\n${"  x();\n".repeat(100)}}`;
    const bigNode: FunctionNode = {
      ...fn("bigFunction"),
      snippet: longSnippet,
      contentHash: "hash-that-wont-match-cache",
    };

    const writer = createSqliteWriter(db);
    await writer.addNodes([bigNode]);

    const searchIndex = await createSearchIndex({ vectorDimensions });
    // Use a cache that starts empty — forces regeneration on cache miss
    const store = new Map<string, Float32Array>();
    const emptyCache: import("../embedding/embeddingCache.js").EmbeddingCacheConnection =
      {
        get(hash: string) {
          return store.get(hash);
        },
        getBatch(hashes: string[]) {
          const map = new Map<string, Float32Array>();
          for (const hash of hashes) {
            const val = store.get(hash);
            if (val) {
              map.set(hash, val);
            }
          }
          return map;
        },
        set(hash: string, embedding: Float32Array) {
          store.set(hash, embedding);
        },
        close() {},
      };

    const result = await populateSearchIndex({
      db,
      searchIndex,
      embeddingCache: emptyCache,
      embeddingProvider: overflowProvider,
    });

    // Should succeed via progressive truncation fallback, not throw
    expect(result.total).toBe(1);
    expect(result.regenerated).toBe(1);
    expect(await searchIndex.count()).toBe(1);
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
    });

    expect(result.total).toBe(1000);
    expect(await searchIndex.count()).toBe(1000);
  });
});
