import {
  existsSync,
  mkdirSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import type { Database } from "better-sqlite3";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { ProjectConfig } from "../config/Config.schemas.js";
import { createSqliteWriter } from "../db/sqlite/createSqliteWriter.js";
import {
  closeDatabase,
  openDatabase,
} from "../db/sqlite/sqliteConnection.utils.js";
import { initializeSchema } from "../db/sqlite/sqliteSchema.utils.js";
import { dependenciesOf } from "../tools/dependencies-of/dependenciesOf.js";
import { dependentsOf } from "../tools/dependents-of/dependentsOf.js";
import { indexProject } from "./indexProject.js";
import { type IndexManifest, saveManifest } from "./manifest.js";
import { type WatchHandle, watchProject } from "./watchProject.js";

/**
 * E2E tests for file watcher functionality.
 *
 * Tests the complete flow: index → watch → modify file → query tools → verify updates.
 * Uses .tmp/ directory inside project (cleared on test start).
 */
describe("watchProject E2E", () => {
  const TEST_DIR = join(dirname(__dirname), "../.tmp/watcher-test");
  const DB_PATH = join(TEST_DIR, ".ts-graph/graph.db");
  let db: Database;
  let watchHandle: WatchHandle;
  let manifest: IndexManifest;

  const sleep = (ms: number) =>
    new Promise((resolve) => setTimeout(resolve, ms));

  beforeAll(async () => {
    // Clear and recreate test directory
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
    mkdirSync(join(TEST_DIR, "src"), { recursive: true });
    mkdirSync(join(TEST_DIR, ".ts-graph"), { recursive: true });

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

    const config: ProjectConfig = {
      modules: [
        {
          name: "test",
          packages: [{ name: "main", tsconfig: "tsconfig.json" }],
        },
      ],
    };

    const writer = createSqliteWriter(db);
    await indexProject(config, writer, { projectRoot: TEST_DIR });

    // Create initial manifest
    manifest = { version: 1, files: {} };
    saveManifest(DB_PATH, manifest);

    // Start watcher with short debounce for fast tests
    // Use polling for reliable event detection in tests
    watchHandle = watchProject(db, config, manifest, {
      projectRoot: TEST_DIR,
      dbPath: DB_PATH,
      debounce: 50,
      usePolling: true,
      pollingInterval: 100,
      silent: true,
    });

    // Wait for watcher to be ready before running tests
    await watchHandle.ready;
  });

  afterAll(async () => {
    await watchHandle.close();
    closeDatabase(db);
    // Leave .tmp/ for inspection, cleared on next run
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

    // Wait for watcher to process (polling interval + debounce + processing time)
    await sleep(500);

    const output = dependenciesOf(db, TEST_DIR, "src/entry.ts", "entry");
    expect(output).toContain("newHelper");
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

    await sleep(500);

    // Now entry → newHelper → deepHelper
    const output = dependenciesOf(db, TEST_DIR, "src/entry.ts", "entry");
    expect(output).toContain(
      "entry --CALLS--> newHelper --CALLS--> deepHelper",
    );
  });

  it("handles file deletion", async () => {
    // Delete the old helper.ts (no longer used)
    unlinkSync(join(TEST_DIR, "src/helper.ts"));

    await sleep(300);

    // Old helper symbol should not be found (removed from database)
    const output = dependentsOf(db, TEST_DIR, "src/helper.ts", "helper");
    // The tool reports "Symbol not found" because the node was deleted
    expect(output).toContain("not found");
  });

  it("handles rapid successive changes", async () => {
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

    await sleep(500);

    // File should be indexed (debouncer coalesces the rapid changes)
    const output = dependentsOf(db, TEST_DIR, "src/rapid.ts", "rapid");
    // Just verify it exists (no callers, so "No dependents found")
    expect(output).toBe("No dependents found.");

    // But we can verify it's indexed by checking dependencies
    const depsOutput = dependenciesOf(db, TEST_DIR, "src/rapid.ts", "rapid");
    expect(depsOutput).toBe("No dependencies found.");
  });
});
