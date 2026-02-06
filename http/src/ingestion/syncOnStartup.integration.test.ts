import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ProjectConfig } from "../config/Config.schemas.js";
import { loadConfig } from "../config/configLoader.utils.js";
import { createSqliteWriter } from "../db/sqlite/createSqliteWriter.js";
import {
  closeDatabase,
  openDatabase,
} from "../db/sqlite/sqliteConnection.utils.js";
import { initializeSchema } from "../db/sqlite/sqliteSchema.utils.js";
import { createFakeEmbeddingCache } from "../embedding/createFakeEmbeddingCache.js";
import { createFakeEmbeddingProvider } from "../embedding/createFakeEmbeddingProvider.js";
import { openEmbeddingCache } from "../embedding/embeddingCache.js";
import { silentLogger } from "../logging/SilentTsGraphLogger.js";
import { dependenciesOf } from "../query/dependencies-of/dependenciesOf.js";
import { createSearchIndex } from "../search/createSearchIndex.js";
import { populateSearchIndex } from "../search/populateSearchIndex.js";
import { indexProject } from "./indexProject.js";
import { type IndexManifest, saveManifest } from "./manifest.js";
import { syncOnStartup } from "./syncOnStartup.js";

const TEST_DIR = "/tmp/ts-graph-sync-startup-test";
const CACHE_DIR = join(TEST_DIR, ".ts-graph-mcp");

const vectorDimensions = 3; // Use small dimensions for testing to speed up embedding generation

describe(syncOnStartup.name, () => {
  let db: Database.Database;

  beforeEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
    mkdirSync(TEST_DIR, { recursive: true });
    mkdirSync(CACHE_DIR, { recursive: true });

    db = openDatabase({ path: ":memory:" });
    initializeSchema(db);
  });

  afterEach(() => {
    closeDatabase(db);
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
  });

  it("populates search index from existing database on startup", async () => {
    // Setup: Create a project with source files
    const pkgDir = join(TEST_DIR, "src");
    mkdirSync(pkgDir, { recursive: true });

    writeFileSync(
      join(TEST_DIR, "tsconfig.json"),
      JSON.stringify({
        compilerOptions: { target: "ES2022", module: "NodeNext" },
        include: ["src/**/*.ts"],
      }),
    );

    const validatorsPath = join(pkgDir, "validators.ts");
    writeFileSync(
      validatorsPath,
      `
export function validateUser(user: unknown): boolean {
  return typeof user === 'object' && user !== null;
}

export function validateEmail(email: string): boolean {
  return email.includes('@');
}
`.trim(),
    );

    const config: ProjectConfig = {
      packages: [{ name: "main", tsconfig: "./tsconfig.json" }],
    };

    // Step 1: Index the project (populates both DB and search index)
    const initialSearchIndex = await createSearchIndex({
      vectorDimensions,
    });
    const writer = createSqliteWriter(db);
    const embeddingProvider = createFakeEmbeddingProvider({
      dimensions: vectorDimensions,
    });
    const indexResult = await indexProject(config, writer, {
      projectRoot: TEST_DIR,
      cacheDir: CACHE_DIR,
      modelName: "test-model",
      logger: silentLogger,
      searchIndex: initialSearchIndex,
      embeddingProvider,
    });

    expect(indexResult.nodesAdded).toBeGreaterThan(0);
    expect(await initialSearchIndex.count()).toBeGreaterThan(0);

    // Verify search works on initial index
    const initialResults = await initialSearchIndex.search("validate");
    expect(initialResults.length).toBeGreaterThan(0);

    // Step 2: Simulate server restart - create a NEW empty search index
    // (This is what happens in server.ts on restart)
    const freshSearchIndex = await createSearchIndex({ vectorDimensions });
    expect(await freshSearchIndex.count()).toBe(0);

    // Create manifest that matches current file state (simulating previous indexing)
    const stat = statSync(validatorsPath);
    const manifest: IndexManifest = {
      version: 1,
      files: {
        "src/validators.ts": {
          mtime: stat.mtimeMs,
          size: stat.size,
        },
      },
    };
    saveManifest(CACHE_DIR, manifest);

    // Step 3: Call syncOnStartup - files are unchanged so no reindexing
    const syncResult = await syncOnStartup(db, config, manifest, {
      projectRoot: TEST_DIR,
      cacheDir: CACHE_DIR,
      logger: silentLogger,
      searchIndex: freshSearchIndex,
      embeddingProvider,
    });

    // No files should need reindexing (manifest matches filesystem)
    expect(syncResult.staleCount).toBe(0);
    expect(syncResult.deletedCount).toBe(0);
    expect(syncResult.addedCount).toBe(0);

    // Step 4: Populate search index from existing database
    // syncOnStartup only handles changed files, not unchanged ones.
    // Callers must call populateSearchIndex to load existing data.
    await populateSearchIndex({
      db,
      searchIndex: freshSearchIndex,
      embeddingCache: createFakeEmbeddingCache(vectorDimensions),
      embeddingProvider: embeddingProvider,
    });

    // Step 5: Verify search works on the populated index
    const searchResults = await freshSearchIndex.search("validate");
    expect(searchResults.length).toBeGreaterThan(0);
    expect(searchResults.map((r) => r.symbol)).toContain("validateUser");
  });

  it("uses embedding cache during reindexing (avoids regenerating cached embeddings)", async () => {
    // Setup: Create a project with source files
    const pkgDir = join(TEST_DIR, "src");
    mkdirSync(pkgDir, { recursive: true });

    writeFileSync(
      join(TEST_DIR, "tsconfig.json"),
      JSON.stringify({
        compilerOptions: { target: "ES2022", module: "NodeNext" },
        include: ["src/**/*.ts"],
      }),
    );

    const utilsPath = join(pkgDir, "utils.ts");
    writeFileSync(
      utilsPath,
      `
export function formatDate(date: Date): string {
  return date.toISOString();
}
`.trim(),
    );

    const config: ProjectConfig = {
      packages: [{ name: "main", tsconfig: "./tsconfig.json" }],
    };

    // Step 1: Index with embedding provider and cache
    const generatedEmbeddings: string[] = [];
    const embeddingProvider = createFakeEmbeddingProvider({
      dimensions: vectorDimensions,
      onEmbed: (content) => generatedEmbeddings.push(content),
    });

    const searchIndex = await createSearchIndex({ vectorDimensions });
    const writer = createSqliteWriter(db);
    await indexProject(config, writer, {
      projectRoot: TEST_DIR,
      cacheDir: CACHE_DIR,
      modelName: "test-model",
      logger: silentLogger,
      searchIndex,
      embeddingProvider,
    });

    // Verify embedding was generated and cached
    expect(generatedEmbeddings).toHaveLength(1);
    expect(generatedEmbeddings[0]).toContain("formatDate");

    // Verify cache has the embedding
    const cache = openEmbeddingCache(CACHE_DIR, "test-model");
    // Cache should have 1 entry (we can't easily query count, but it exists)
    cache.close();

    // Step 2: Clear DB but keep cache - simulate server restart that needs reindex
    await writer.clearAll();

    // Step 3: Create manifest that marks the file as needing reindex
    // (by having wrong mtime/size, or being missing from manifest)
    const manifest: IndexManifest = {
      version: 1,
      files: {}, // Empty = all files will be treated as "added"
    };
    saveManifest(CACHE_DIR, manifest);

    // Clear the tracking array
    generatedEmbeddings.length = 0;

    // Step 4: Run syncOnStartup - file content unchanged, cache should be used
    const syncResult = await syncOnStartup(db, config, manifest, {
      projectRoot: TEST_DIR,
      cacheDir: CACHE_DIR,
      logger: silentLogger,
      searchIndex,
      embeddingProvider,
      modelName: "test-model",
    });

    // File was detected as new (not in manifest)
    expect(syncResult.addedCount).toBe(1);

    // CRITICAL ASSERTION: If cache is working, NO embeddings should be regenerated
    // because the file content is unchanged and was already cached.
    expect(generatedEmbeddings).toHaveLength(0);
  });
});

describe("syncOnStartup cross-package resolution", () => {
  it(
    "preserves cross-package namespace import edges after reindexing",
    { timeout: 60_000 },
    async () => {
      // Uses yarn-pnp-monorepo which has namespace imports requiring projectRegistry:
      // backend/api.ts: calculateArea() calls MathUtils.multiply()
      const projectRoot = join(
        import.meta.dirname,
        "../../../sample-projects/yarn-pnp-monorepo",
      );
      const cacheDir = mkdtempSync(
        join(tmpdir(), "ts-graph-sync-registry-test-"),
      );
      mkdirSync(cacheDir, { recursive: true });

      const db = openDatabase({ path: ":memory:" });
      initializeSchema(db);
      const writer = createSqliteWriter(db);
      const config = loadConfig(`${projectRoot}/ts-graph-mcp.config.json`);
      const embeddingProvider = createFakeEmbeddingProvider({
        dimensions: vectorDimensions,
      });

      await indexProject(config, writer, {
        projectRoot,
        logger: silentLogger,
        embeddingProvider,
      });

      const baselineOutput = dependenciesOf(
        db,
        "modules/app/packages/backend/src/api.ts",
        "formatLabel",
      );
      expect(baselineOutput).toContain("formatLabel --CALLS--> capitalize");

      await writer.removeFileNodes("modules/app/packages/backend/src/api.ts");

      // Build manifest with all files EXCEPT the one we want to reindex
      const manifest: IndexManifest = { version: 1, files: {} };
      const allNodes = db
        .prepare<[], { file_path: string }>(
          "SELECT DISTINCT file_path FROM nodes",
        )
        .all();
      for (const row of allNodes) {
        const absolutePath = join(projectRoot, row.file_path);
        try {
          const stat = statSync(absolutePath);
          manifest.files[row.file_path] = {
            mtime: stat.mtimeMs,
            size: stat.size,
          };
        } catch {
          // File might not exist, skip
        }
      }
      saveManifest(cacheDir, manifest);

      await syncOnStartup(db, config, manifest, {
        projectRoot,
        cacheDir,
        logger: silentLogger,
        embeddingProvider,
      });

      const afterSync = dependenciesOf(
        db,
        "modules/app/packages/backend/src/api.ts",
        "formatLabel",
      );
      expect(afterSync).toContain("formatLabel --CALLS--> capitalize");

      closeDatabase(db);
      rmSync(cacheDir, { recursive: true });
    },
  );
});
