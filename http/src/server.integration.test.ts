import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createNoopEmbeddingProvider } from "./embedding/createNoopEmbeddingProvider.js";
import {
  type IndexManifest,
  saveManifest,
  updateManifestEntry,
} from "./ingestion/manifest.js";
import { silentLogger } from "./logging/SilentTsGraphLogger.js";
import { createSearchIndex } from "./search/createSearchIndex.js";
import { indexAndOpenDb } from "./server.js";

describe(indexAndOpenDb.name, () => {
  let TEST_DIR: string;

  beforeEach(() => {
    TEST_DIR = mkdtempSync(join(tmpdir(), "ts-graph-server-integration-"));
  });

  afterEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
  });

  it("reindexes when on-disk DB schema version is outdated", async () => {
    const srcDir = join(TEST_DIR, "src");
    mkdirSync(srcDir, { recursive: true });
    const srcFile = join(srcDir, "foo.ts");
    writeFileSync(srcFile, "export function foo() { return 1; }\n");

    writeFileSync(
      join(TEST_DIR, "tsconfig.json"),
      JSON.stringify({
        compilerOptions: {
          target: "ES2022",
          module: "NodeNext",
          strict: true,
        },
        include: ["src/**/*.ts"],
      }),
    );

    writeFileSync(
      join(TEST_DIR, "ts-graph-mcp.config.json"),
      JSON.stringify({
        packages: [{ name: "main", tsconfig: "./tsconfig.json" }],
      }),
    );

    const cacheDir = join(TEST_DIR, ".ts-graph-mcp");
    const sqliteDir = join(cacheDir, "sqlite");
    mkdirSync(sqliteDir, { recursive: true });
    const dbPath = join(sqliteDir, "graph.db");

    const oldDb = new Database(dbPath);
    oldDb.pragma("user_version = 1");
    oldDb.exec(
      "CREATE TABLE nodes (id TEXT PRIMARY KEY, content_hash TEXT NOT NULL)",
    );
    oldDb.exec(
      "CREATE TABLE edges (source TEXT, target TEXT, type TEXT, PRIMARY KEY (source, target, type))",
    );
    oldDb.close();

    const manifest: IndexManifest = { version: 1, files: {} };
    updateManifestEntry(manifest, "src/foo.ts", srcFile);
    saveManifest(cacheDir, manifest);

    const searchIndex = await createSearchIndex({
      vectorSearchEnabled: false,
      vectorDimensions: 0,
    });
    const embeddingProvider = createNoopEmbeddingProvider();

    const result = await indexAndOpenDb(
      TEST_DIR,
      cacheDir,
      "noop",
      false,
      silentLogger,
      searchIndex,
      embeddingProvider,
    );

    const row = result.db
      .prepare<[], { c: number }>("SELECT COUNT(*) as c FROM nodes")
      .get();
    result.db.close();

    expect(row?.c ?? 0).toBeGreaterThan(0);
  });
});
