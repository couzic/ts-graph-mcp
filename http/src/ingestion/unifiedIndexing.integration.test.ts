import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type Database from "better-sqlite3";
import { Project } from "ts-morph";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ProjectConfig } from "../config/Config.schemas.js";
import { createSqliteWriter } from "../db/sqlite/createSqliteWriter.js";
import {
  closeDatabase,
  openDatabase,
} from "../db/sqlite/sqliteConnection.utils.js";
import { initializeSchema } from "../db/sqlite/sqliteSchema.utils.js";
import { silentLogger } from "../logging/SilentTsGraphLogger.js";
import { createSearchIndex } from "../search/createSearchIndex.js";
import { indexFile } from "./indexFile.js";
import { indexProject } from "./indexProject.js";
import { type IndexManifest, saveManifest } from "./manifest.js";
import { watchProject } from "./watchProject.js";

const TEST_DIR = mkdtempSync(join(tmpdir(), "unified-indexing-test-"));

describe("Unified Indexing", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = openDatabase({ path: ":memory:" });
    initializeSchema(db);
  });

  afterEach(() => {
    closeDatabase(db);
  });

  describe(indexFile.name, () => {
    it("adds nodes to search index when searchIndex is provided", async () => {
      // Create temp file
      const pkgDir = join(TEST_DIR, "indexFile-test");
      mkdirSync(pkgDir, { recursive: true });
      writeFileSync(
        join(pkgDir, "tsconfig.json"),
        JSON.stringify({
          compilerOptions: { target: "ES2022", module: "NodeNext" },
          include: ["*.ts"],
        }),
      );
      writeFileSync(
        join(pkgDir, "utils.ts"),
        `export function formatDate(d: Date): string { return d.toISOString(); }
export function parseDate(s: string): Date { return new Date(s); }`,
      );

      const project = new Project({ tsConfigFilePath: join(pkgDir, "tsconfig.json") });
      const sourceFile = project.getSourceFileOrThrow(join(pkgDir, "utils.ts"));

      const writer = createSqliteWriter(db);
      const searchIndex = await createSearchIndex();

      const result = await indexFile(
        sourceFile,
        { filePath: "utils.ts", package: "main" },
        writer,
        { searchIndex },
      );

      // Verify nodes were added to SQLite
      expect(result.nodesAdded).toBeGreaterThan(0);

      // Verify search index was populated (File nodes are excluded)
      const searchCount = await searchIndex.count();
      expect(searchCount).toBe(2); // formatDate + parseDate

      // Verify searchable
      const results = await searchIndex.search("format");
      expect(results).toHaveLength(1);
      expect(results[0]?.symbol).toBe("formatDate");
    });

    it("does not add to search index when searchIndex is not provided", async () => {
      const pkgDir = join(TEST_DIR, "indexFile-no-search-test");
      mkdirSync(pkgDir, { recursive: true });
      writeFileSync(
        join(pkgDir, "tsconfig.json"),
        JSON.stringify({
          compilerOptions: { target: "ES2022" },
          include: ["*.ts"],
        }),
      );
      writeFileSync(join(pkgDir, "app.ts"), "export const app = true;");

      const project = new Project({ tsConfigFilePath: join(pkgDir, "tsconfig.json") });
      const sourceFile = project.getSourceFileOrThrow(join(pkgDir, "app.ts"));

      const writer = createSqliteWriter(db);

      // No searchIndex passed
      const result = await indexFile(
        sourceFile,
        { filePath: "app.ts", package: "main" },
        writer,
      );

      // SQLite should have nodes
      expect(result.nodesAdded).toBeGreaterThan(0);

      // This should not throw - searchIndex is optional
    });
  });

  describe(indexProject.name, () => {
    it("populates search index during indexing", async () => {
      const pkgDir = join(TEST_DIR, "indexProject-search-test");
      mkdirSync(pkgDir, { recursive: true });
      writeFileSync(
        join(pkgDir, "tsconfig.json"),
        JSON.stringify({
          compilerOptions: { target: "ES2022", module: "NodeNext" },
          include: ["*.ts"],
        }),
      );
      writeFileSync(
        join(pkgDir, "service.ts"),
        `export function handleRequest(): void {}
export function validateInput(): boolean { return true; }`,
      );
      writeFileSync(
        join(pkgDir, "utils.ts"),
        `export function formatOutput(): string { return ""; }`,
      );

      const config: ProjectConfig = {
        packages: [{ name: "main", tsconfig: "./tsconfig.json" }],
      };

      const writer = createSqliteWriter(db);
      const searchIndex = await createSearchIndex();

      const result = await indexProject(config, writer, {
        projectRoot: pkgDir,
        logger: silentLogger,
        searchIndex,
      });

      // Verify files were indexed
      expect(result.filesProcessed).toBe(2);

      // Verify search index has symbols (excluding File nodes)
      const searchCount = await searchIndex.count();
      expect(searchCount).toBe(3); // handleRequest, validateInput, formatOutput

      // Verify searchable by different terms
      const requestResults = await searchIndex.search("Request");
      expect(requestResults).toHaveLength(1);
      expect(requestResults[0]?.symbol).toBe("handleRequest");

      const validateResults = await searchIndex.search("validate");
      expect(validateResults).toHaveLength(1);
      expect(validateResults[0]?.symbol).toBe("validateInput");
    });
  });
});

describe("Unified Indexing - Watch Mode", () => {
  const WATCH_TEST_DIR = mkdtempSync(join(tmpdir(), "unified-watch-test-"));
  const CACHE_DIR = join(WATCH_TEST_DIR, ".ts-graph-mcp");
  const DB_PATH = join(CACHE_DIR, "graph.db");

  let db: Database.Database;

  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  beforeEach(() => {
    mkdirSync(join(WATCH_TEST_DIR, "src"), { recursive: true });
    mkdirSync(CACHE_DIR, { recursive: true });

    writeFileSync(
      join(WATCH_TEST_DIR, "tsconfig.json"),
      JSON.stringify({
        compilerOptions: {
          target: "ES2022",
          module: "ESNext",
          moduleResolution: "bundler",
        },
        include: ["src/**/*.ts"],
      }),
    );

    db = openDatabase({ path: DB_PATH });
    initializeSchema(db);
  });

  afterEach(() => {
    closeDatabase(db);
    if (existsSync(WATCH_TEST_DIR)) {
      rmSync(WATCH_TEST_DIR, { recursive: true, force: true });
    }
  });

  it("updates search index on file add", async () => {
    // Initial file
    writeFileSync(
      join(WATCH_TEST_DIR, "src/initial.ts"),
      `export function initial(): void {}`,
    );

    const config: ProjectConfig = {
      packages: [{ name: "main", tsconfig: "tsconfig.json" }],
    };

    const writer = createSqliteWriter(db);
    const searchIndex = await createSearchIndex();

    // Index initially
    await indexProject(config, writer, {
      projectRoot: WATCH_TEST_DIR,
      logger: silentLogger,
      searchIndex,
    });

    expect(await searchIndex.count()).toBe(1);

    // Start watcher with search index
    const manifest: IndexManifest = { version: 1, files: {} };
    saveManifest(CACHE_DIR, manifest);

    const watchHandle = watchProject(db, config, manifest, {
      projectRoot: WATCH_TEST_DIR,
      cacheDir: CACHE_DIR,
      logger: silentLogger,
      searchIndex,
      debounce: true,
      debounceInterval: 50,
    });

    await watchHandle.ready;
    await sleep(200);

    // Add new file
    writeFileSync(
      join(WATCH_TEST_DIR, "src/newfile.ts"),
      `export function newFunction(): void {}`,
    );

    await sleep(500);

    // Verify search index was updated
    const results = await searchIndex.search("newFunction");
    expect(results).toHaveLength(1);
    expect(results[0]?.symbol).toBe("newFunction");

    await watchHandle.close();
  });

  it("removes from search index on file delete", async () => {
    // Create file to delete
    writeFileSync(
      join(WATCH_TEST_DIR, "src/toDelete.ts"),
      `export function willBeDeleted(): void {}`,
    );

    const config: ProjectConfig = {
      packages: [{ name: "main", tsconfig: "tsconfig.json" }],
    };

    const writer = createSqliteWriter(db);
    const searchIndex = await createSearchIndex();

    // Index initially
    await indexProject(config, writer, {
      projectRoot: WATCH_TEST_DIR,
      logger: silentLogger,
      searchIndex,
    });

    // Verify it's in search index
    const beforeResults = await searchIndex.search("willBeDeleted");
    expect(beforeResults).toHaveLength(1);

    // Start watcher
    const manifest: IndexManifest = { version: 1, files: {} };
    saveManifest(CACHE_DIR, manifest);

    const watchHandle = watchProject(db, config, manifest, {
      projectRoot: WATCH_TEST_DIR,
      cacheDir: CACHE_DIR,
      logger: silentLogger,
      searchIndex,
      debounce: true,
      debounceInterval: 50,
    });

    await watchHandle.ready;
    await sleep(200);

    // Delete file
    unlinkSync(join(WATCH_TEST_DIR, "src/toDelete.ts"));

    await sleep(500);

    // Verify removed from search index
    const afterResults = await searchIndex.search("willBeDeleted");
    expect(afterResults).toHaveLength(0);

    // Verify removed from SQLite too
    const dbNode = db
      .prepare("SELECT * FROM nodes WHERE id LIKE '%willBeDeleted%'")
      .get();
    expect(dbNode).toBeUndefined();

    await watchHandle.close();
  });

  it("updates search index on file modification", async () => {
    // Create file with initial content
    writeFileSync(
      join(WATCH_TEST_DIR, "src/modify.ts"),
      `export function originalName(): void {}`,
    );

    const config: ProjectConfig = {
      packages: [{ name: "main", tsconfig: "tsconfig.json" }],
    };

    const writer = createSqliteWriter(db);
    const searchIndex = await createSearchIndex();

    // Index initially
    await indexProject(config, writer, {
      projectRoot: WATCH_TEST_DIR,
      logger: silentLogger,
      searchIndex,
    });

    // Verify original is in search index
    const beforeResults = await searchIndex.search("originalName");
    expect(beforeResults).toHaveLength(1);

    // Start watcher
    const manifest: IndexManifest = { version: 1, files: {} };
    saveManifest(CACHE_DIR, manifest);

    const watchHandle = watchProject(db, config, manifest, {
      projectRoot: WATCH_TEST_DIR,
      cacheDir: CACHE_DIR,
      logger: silentLogger,
      searchIndex,
      debounce: true,
      debounceInterval: 50,
    });

    await watchHandle.ready;
    await sleep(200);

    // Modify file - rename function
    writeFileSync(
      join(WATCH_TEST_DIR, "src/modify.ts"),
      `export function renamedFunction(): void {}`,
    );

    await sleep(500);

    // Original name should be gone
    const oldResults = await searchIndex.search("originalName");
    expect(oldResults).toHaveLength(0);

    // New name should be searchable
    const newResults = await searchIndex.search("renamedFunction");
    expect(newResults).toHaveLength(1);
    expect(newResults[0]?.symbol).toBe("renamedFunction");

    await watchHandle.close();
  });
});
