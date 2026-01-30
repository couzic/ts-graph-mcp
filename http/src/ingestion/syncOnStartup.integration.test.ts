import { existsSync, mkdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ProjectConfig } from "../config/Config.schemas.js";
import { createSqliteWriter } from "../db/sqlite/createSqliteWriter.js";
import {
  closeDatabase,
  openDatabase,
} from "../db/sqlite/sqliteConnection.utils.js";
import { initializeSchema } from "../db/sqlite/sqliteSchema.utils.js";
import { silentLogger } from "../logging/SilentTsGraphLogger.js";
import { createSearchIndex, loadSearchIndexFromFile } from "../search/createSearchIndex.js";
import { populateSearchIndex } from "../search/populateSearchIndex.js";
import { indexProject } from "./indexProject.js";
import { type IndexManifest, saveManifest } from "./manifest.js";
import { syncOnStartup } from "./syncOnStartup.js";

const TEST_DIR = "/tmp/ts-graph-sync-startup-test";
const CACHE_DIR = join(TEST_DIR, ".ts-graph-mcp");

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
    const initialSearchIndex = await createSearchIndex();
    const writer = createSqliteWriter(db);
    const indexResult = await indexProject(config, writer, {
      projectRoot: TEST_DIR,
      logger: silentLogger,
      searchIndex: initialSearchIndex,
    });

    expect(indexResult.nodesAdded).toBeGreaterThan(0);
    expect(await initialSearchIndex.count()).toBeGreaterThan(0);

    // Verify search works on initial index
    const initialResults = await initialSearchIndex.search("validate");
    expect(initialResults.length).toBeGreaterThan(0);

    // Step 2: Simulate server restart - create a NEW empty search index
    // (This is what happens in server.ts on restart)
    const freshSearchIndex = await createSearchIndex();
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
    });

    // No files should need reindexing (manifest matches filesystem)
    expect(syncResult.staleCount).toBe(0);
    expect(syncResult.deletedCount).toBe(0);
    expect(syncResult.addedCount).toBe(0);

    // Step 4: Populate search index from existing database
    // syncOnStartup only handles changed files, not unchanged ones.
    // Callers must call populateSearchIndex to load existing data.
    await populateSearchIndex(db, freshSearchIndex);

    // Step 5: Verify search works on the populated index
    const searchResults = await freshSearchIndex.search("validate");
    expect(searchResults.length).toBeGreaterThan(0);
    expect(searchResults.map((r) => r.symbol)).toContain("validateUser");
  });

  it("persists and loads search index from disk on restart", async () => {
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

    const cartPath = join(pkgDir, "cart.ts");
    writeFileSync(
      cartPath,
      `
export function validateCart(items: unknown[]): boolean {
  return items.length > 0;
}

export function calculateTotal(prices: number[]): number {
  return prices.reduce((a, b) => a + b, 0);
}
`.trim(),
    );

    const config: ProjectConfig = {
      packages: [{ name: "main", tsconfig: "./tsconfig.json" }],
    };

    const oramaIndexPath = join(CACHE_DIR, "orama", "index.json");
    mkdirSync(join(CACHE_DIR, "orama"), { recursive: true });

    // Step 1: Index the project with search index
    const initialSearchIndex = await createSearchIndex();
    const writer = createSqliteWriter(db);
    const indexResult = await indexProject(config, writer, {
      projectRoot: TEST_DIR,
      logger: silentLogger,
      searchIndex: initialSearchIndex,
    });

    expect(indexResult.nodesAdded).toBeGreaterThan(0);

    // Verify search works
    const initialResults = await initialSearchIndex.search("validate");
    expect(initialResults.length).toBeGreaterThan(0);

    // Step 2: Save search index to disk
    await initialSearchIndex.saveToFile(oramaIndexPath);
    expect(existsSync(oramaIndexPath)).toBe(true);

    // Step 3: Simulate server restart - load search index from file
    const loadedSearchIndex = await loadSearchIndexFromFile(oramaIndexPath);
    expect(loadedSearchIndex).not.toBeNull();

    // Step 4: Verify search works on loaded index (no populateSearchIndex needed!)
    const loadedResults = await loadedSearchIndex!.search("validate");
    expect(loadedResults.length).toBeGreaterThan(0);
    expect(loadedResults.map((r) => r.symbol)).toContain("validateCart");

    // Step 5: Verify file tracking is preserved
    await loadedSearchIndex!.removeByFile("src/cart.ts");
    const afterRemoval = await loadedSearchIndex!.search("validate");
    expect(afterRemoval).toHaveLength(0);
  });

  it("handles file changes after restart with persisted index", async () => {
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

    const oramaIndexPath = join(CACHE_DIR, "orama", "index.json");
    mkdirSync(join(CACHE_DIR, "orama"), { recursive: true });

    // Step 1: Index the project
    const initialSearchIndex = await createSearchIndex();
    const writer = createSqliteWriter(db);
    await indexProject(config, writer, {
      projectRoot: TEST_DIR,
      logger: silentLogger,
      searchIndex: initialSearchIndex,
    });

    // Save search index and manifest
    await initialSearchIndex.saveToFile(oramaIndexPath);
    const stat = statSync(utilsPath);
    const manifest: IndexManifest = {
      version: 1,
      files: {
        "src/utils.ts": {
          mtime: stat.mtimeMs,
          size: stat.size,
        },
      },
    };
    saveManifest(CACHE_DIR, manifest);

    // Step 2: Modify file while server is "down"
    writeFileSync(
      utilsPath,
      `
export function formatDate(date: Date): string {
  return date.toISOString();
}

export function parseDate(str: string): Date {
  return new Date(str);
}
`.trim(),
    );

    // Step 3: Simulate restart - load persisted search index
    const loadedSearchIndex = await loadSearchIndexFromFile(oramaIndexPath);
    expect(loadedSearchIndex).not.toBeNull();

    // Step 4: Run syncOnStartup - should detect modified file
    const syncResult = await syncOnStartup(db, config, manifest, {
      projectRoot: TEST_DIR,
      cacheDir: CACHE_DIR,
      logger: silentLogger,
      searchIndex: loadedSearchIndex!,
    });

    // File was modified
    expect(syncResult.staleCount).toBe(1);

    // Step 5: Verify new function is searchable
    const results = await loadedSearchIndex!.search("parse");
    expect(results.length).toBeGreaterThan(0);
    expect(results.map((r) => r.symbol)).toContain("parseDate");
  });
});
