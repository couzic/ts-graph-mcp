import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Database } from "better-sqlite3";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { ProjectConfig } from "../config/Config.schemas.js";
import { createSqliteWriter } from "../db/sqlite/createSqliteWriter.js";
import {
  closeDatabase,
  openDatabase,
} from "../db/sqlite/sqliteConnection.utils.js";
import { initializeSchema } from "../db/sqlite/sqliteSchema.utils.js";
import { silentLogger } from "../logging/SilentTsGraphLogger.js";
import { dependenciesOf } from "../query/dependencies-of/dependenciesOf.js";
import { dependentsOf } from "../query/dependents-of/dependentsOf.js";
import { indexProject } from "./indexProject.js";
import { type IndexManifest, saveManifest } from "./manifest.js";
import {
  type WatchHandle,
  type WatchOptions,
  watchProject,
} from "./watchProject.js";

const pollingInterval = 100;
const debounceInterval = 100;
const processingTime = 500;
/**
 * Watch mode configurations to test.
 *
 * Both modes should produce identical behavior from the user's perspective:
 * - File changes are detected
 * - Database is updated
 * - Rapid changes are batched (polling: inherently, debounce: via RxJS)
 */
const watchModes: Array<{
  name: string;
  config: Partial<WatchOptions>;
  waitTime: number; // Time to wait for changes to be processed
}> = [
  {
    name: "polling",
    config: { polling: true, pollingInterval },
    waitTime: pollingInterval + processingTime + 500,
  },
  {
    name: "fs.watch + debounce",
    config: { debounce: true, debounceInterval },
    waitTime: debounceInterval + processingTime,
  },
];

/**
 * E2E tests for file watcher functionality.
 *
 * Tests the complete flow: index → watch → modify file → query tools → verify updates.
 * Uses unique temp directory per test run to avoid interference.
 *
 * Runs the same tests against both watch modes:
 * - Polling mode: chokidar scans filesystem at intervals
 * - fs.watch + debounce: OS events batched via RxJS
 */
describe.each(watchModes)("watchProject E2E ($name mode)", ({
  config,
  waitTime,
}) => {
  // mkdtempSync creates a unique temp directory with random suffix to avoid test interference
  const TEST_DIR = mkdtempSync(join(tmpdir(), "watcher-test-"));
  const CACHE_DIR = join(TEST_DIR, ".ts-graph-mcp");
  const DB_PATH = join(CACHE_DIR, "graph.db");
  let db: Database;
  let watchHandle: WatchHandle;
  let manifest: IndexManifest;
  let reindexCalls: string[][] = []; // Track onReindex callback invocations

  const sleep = (ms: number) =>
    new Promise((resolve) => setTimeout(resolve, ms));

  beforeAll(async () => {
    // Create subdirectories in the unique temp directory
    mkdirSync(join(TEST_DIR, "src"), { recursive: true });
    mkdirSync(CACHE_DIR, { recursive: true });

    // Create tsconfig.json
    writeFileSync(
      join(TEST_DIR, "tsconfig.json"),
      JSON.stringify(
        {
          compilerOptions: {
            target: "ES2022",
            module: "ESNext",
            moduleResolution: "bundler",
            strict: true,
          },
          include: ["src/**/*.ts"],
        },
        null,
        2,
      ),
    );

    // Create initial source files
    writeFileSync(
      join(TEST_DIR, "src/entry.ts"),
      `import { helper } from "./helper.js";
export function entry(): string { return helper(); }
`,
    );
    writeFileSync(
      join(TEST_DIR, "src/helper.ts"),
      `export function helper(): string { return "v1"; }
`,
    );

    // Open database and index project
    db = openDatabase({ path: DB_PATH });
    initializeSchema(db);

    const projectConfig: ProjectConfig = {
      packages: [{ name: "main", tsconfig: "tsconfig.json" }],
    };

    const writer = createSqliteWriter(db);
    await indexProject(projectConfig, writer, {
      projectRoot: TEST_DIR,
      logger: silentLogger,
    });

    // Create initial manifest
    manifest = { version: 1, files: {} };
    saveManifest(CACHE_DIR, manifest);

    // Start watcher with the mode-specific configuration
    watchHandle = watchProject(db, projectConfig, manifest, {
      projectRoot: TEST_DIR,
      cacheDir: CACHE_DIR,
      logger: silentLogger,
      onReindex: (files) => reindexCalls.push(files),
      ...config,
    });

    // Wait for watcher to be ready
    await watchHandle.ready;
    await sleep(processingTime); // Give chokidar time to fully initialize
  });

  afterAll(async () => {
    await watchHandle.close();
    closeDatabase(db);
    // Clean up temp directory
    rmSync(TEST_DIR, { recursive: true, force: true });
  });

  it("reflects initial state: entry calls helper", () => {
    const output = dependenciesOf(db, TEST_DIR, "src/entry.ts", "entry");
    expect(output).toContain("helper");
    expect(output).toContain("entry --CALLS--> helper");
  });

  it("detects new file and updates dependencies", async () => {
    // Create a new helper file
    writeFileSync(
      join(TEST_DIR, "src/newHelper.ts"),
      `export function newHelper(): string { return "v2"; }
`,
    );

    // Update entry to use new helper
    writeFileSync(
      join(TEST_DIR, "src/entry.ts"),
      `import { newHelper } from "./newHelper.js";
export function entry(): string { return newHelper(); }
`,
    );

    await sleep(waitTime);

    const output = dependenciesOf(db, TEST_DIR, "src/entry.ts", "entry");
    expect(output).toContain("entry --CALLS--> newHelper");
    expect(output).not.toContain("--CALLS--> helper");
  });

  it("handles file modification", async () => {
    // Modify newHelper to call another function
    writeFileSync(
      join(TEST_DIR, "src/deepHelper.ts"),
      `export function deepHelper(): string { return "deep"; }
`,
    );
    writeFileSync(
      join(TEST_DIR, "src/newHelper.ts"),
      `import { deepHelper } from "./deepHelper.js";
export function newHelper(): string { return deepHelper(); }
`,
    );

    await sleep(waitTime);

    // Now entry → newHelper → deepHelper
    const output = dependenciesOf(db, TEST_DIR, "src/entry.ts", "entry");
    expect(output).toContain(
      "entry --CALLS--> newHelper --CALLS--> deepHelper",
    );
  });

  it("handles file deletion", async () => {
    // Delete the old helper.ts (no longer used)
    unlinkSync(join(TEST_DIR, "src/helper.ts"));

    await sleep(waitTime * 2); // This one is particularly flaky

    // Old helper symbol should not be found (removed from database)
    const output = dependentsOf(db, TEST_DIR, "src/helper.ts", "helper");
    // The tool reports "not indexed" because the file was removed from DB
    expect(output).toContain("is not indexed");
  });

  it("batches rapid successive changes into single reindex", async () => {
    // Clear tracking from previous tests
    reindexCalls = [];

    // Simulate rapid saves (like auto-save or format-on-save)
    writeFileSync(
      join(TEST_DIR, "src/rapid.ts"),
      `export function rapid(): number { return 1; }
`,
    );
    writeFileSync(
      join(TEST_DIR, "src/rapid.ts"),
      `export function rapid(): number { return 2; }
`,
    );
    writeFileSync(
      join(TEST_DIR, "src/rapid.ts"),
      `export function rapid(): number { return 3; }
`,
    );

    await sleep(waitTime);

    // Verify batching: onReindex should be called once with rapid.ts
    // (3 rapid writes → 1 batch → 1 reindex call)
    expect(reindexCalls).toHaveLength(1);
    expect(reindexCalls[0]).toContain("src/rapid.ts");

    // Also verify the file is correctly indexed
    // Exact match (file_path + symbol name) returns clean output without resolution message
    const output = dependenciesOf(db, TEST_DIR, "src/rapid.ts", "rapid");
    expect(output).toBe("No dependencies found.");
  });
});
