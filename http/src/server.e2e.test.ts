import assert from "node:assert";
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { silentLogger } from "./logging/SilentTsGraphLogger.js";
import { type ServerHandle, startHttpServer } from "./server.js";

/**
 * E2E test for HTTP server file watching.
 *
 * Unlike watchProject.integration.test.ts which tests watchProject() in isolation,
 * this test starts the actual HTTP server and verifies file changes are detected
 * through the HTTP API.
 *
 * This test will FAIL if the server doesn't start the file watcher.
 */
describe("HTTP server file watching E2E", () => {
  const TEST_DIR = mkdtempSync(join(tmpdir(), "server-e2e-test-"));
  const TEST_PORT = 14999; // Use high port to avoid conflicts
  let serverHandle: ServerHandle;
  let originalCwd: string;

  const sleep = (ms: number) =>
    new Promise((resolve) => setTimeout(resolve, ms));

  beforeAll(async () => {
    // Create test project structure
    mkdirSync(join(TEST_DIR, "src"), { recursive: true });
    mkdirSync(join(TEST_DIR, ".ts-graph-mcp"), { recursive: true });

    // Symlink models from repo root to avoid re-downloading (~300MB)
    const repoRoot = join(import.meta.dirname, "..", "..");
    const repoModelsDir = join(repoRoot, ".ts-graph-mcp", "models");
    symlinkSync(repoModelsDir, join(TEST_DIR, ".ts-graph-mcp", "models"));

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

    writeFileSync(
      join(TEST_DIR, "ts-graph-mcp.config.json"),
      JSON.stringify(
        {
          packages: [{ name: "main", tsconfig: "./tsconfig.json" }],
          server: { port: TEST_PORT },
          watch: { silent: true }, // Watcher has its own silent flag
        },
        null,
        2,
      ),
    );

    // Create initial source file
    writeFileSync(
      join(TEST_DIR, "src/entry.ts"),
      `export function entry(): string { return "v1"; }\n`,
    );

    // Change to test directory (server uses process.cwd())
    originalCwd = process.cwd();
    process.chdir(TEST_DIR);

    // Start the server (this is what production does)
    serverHandle = await startHttpServer([], { logger: silentLogger });

    // Wait for server to be fully ready
    await sleep(1000);
  });

  afterAll(async () => {
    // Restore working directory
    process.chdir(originalCwd);

    // Stop server
    await serverHandle.close();

    // Clean up temp directory
    rmSync(TEST_DIR, { recursive: true, force: true });
  });

  it("indexes initial files", async () => {
    const response = await fetch(
      `http://localhost:${TEST_PORT}/api/symbols?q=entry`,
    );
    const symbols = (await response.json()) as Array<{ symbol: string }>;

    assert(symbols.length === 1, `Expected 1 symbol, got ${symbols.length}`);
    expect(symbols[0]?.symbol).toBe("entry");
  });

  it("detects file changes and reindexes new symbols", async () => {
    // Add a new function to the file
    writeFileSync(
      join(TEST_DIR, "src/entry.ts"),
      `export function entry(): string { return "v2"; }
export function newFunction(): number { return 42; }
`,
    );

    // Wait for watcher to detect and reindex
    // With default debounce of 300ms + processing time, 2s should be plenty
    await sleep(2000);

    // Query the HTTP API to check if newFunction was indexed
    const response = await fetch(
      `http://localhost:${TEST_PORT}/api/symbols?q=newFunction`,
    );
    const symbols = (await response.json()) as Array<{ symbol: string }>;

    // This will FAIL if the server doesn't start the watcher
    assert(symbols.length === 1, `Expected 1 symbol, got ${symbols.length}`);
    expect(symbols[0]?.symbol).toBe("newFunction");
  });

  it("detects new file creation", async () => {
    // Create a completely new file
    writeFileSync(
      join(TEST_DIR, "src/brand-new.ts"),
      `export function brandNew(): boolean { return true; }\n`,
    );

    await sleep(2000);

    const response = await fetch(
      `http://localhost:${TEST_PORT}/api/symbols?q=brandNew`,
    );
    const symbols = (await response.json()) as Array<{ symbol: string }>;

    // This will FAIL if the server doesn't start the watcher
    assert(symbols.length === 1, `Expected 1 symbol, got ${symbols.length}`);
    expect(symbols[0]?.symbol).toBe("brandNew");
  });

  it("uses embedding cache for reindexed files", async () => {
    // This test verifies that semantic search works after file changes.
    // The embedding cache should be used for unchanged content.

    // Step 1: Create initial file
    const searchPath = join(TEST_DIR, "src/searchable.ts");
    writeFileSync(
      searchPath,
      `export function searchableFunction(): string { return "original"; }\n`,
    );

    await sleep(2000);

    // Verify initial indexing worked via symbol search
    const response1 = await fetch(
      `http://localhost:${TEST_PORT}/api/symbols?q=searchableFunction`,
    );
    const symbols1 = (await response1.json()) as Array<{ symbol: string }>;
    expect(symbols1.length).toBe(1);

    // Step 2: Modify file to trigger reindex
    writeFileSync(
      searchPath,
      `export function searchableFunction(): string { return "modified"; }
export function anotherFunction(): number { return 42; }
`,
    );

    await sleep(2000);

    // Step 3: Verify both functions are searchable (reindex worked)
    const response2 = await fetch(
      `http://localhost:${TEST_PORT}/api/symbols?q=anotherFunction`,
    );
    const symbols2 = (await response2.json()) as Array<{ symbol: string }>;
    expect(symbols2.length).toBe(1);
    expect(symbols2[0]?.symbol).toBe("anotherFunction");

    // Step 4: Verify semantic search (graph search with topic) works
    // This requires embeddings to be present.
    // Use "lookup" — semantically related to "search" but does NOT appear
    // literally in the source code, ensuring vector search is exercised.
    const graphResponse = await fetch(
      `http://localhost:${TEST_PORT}/api/graph/search`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic: "lookup" }),
      },
    );
    const graphResult = await graphResponse.text();

    // Semantic search should find the function via vector similarity
    expect(graphResult).toContain("searchableFunction");
  });
});

/**
 * E2E test for topic search after server restart.
 *
 * This test verifies that semantic search (topic queries) continue to work
 * after the server is stopped and restarted with an existing database.
 *
 * Bug: On first run, embeddings are generated and cached. On restart with
 * existing DB, populateSearchIndex() was not loading embeddings from cache,
 * causing all topic searches to return zero results.
 */
describe("HTTP server restart preserves topic search", () => {
  const TEST_DIR = mkdtempSync(join(tmpdir(), "server-restart-test-"));
  const TEST_PORT = 14998; // Different port from other test suite
  let serverHandle: ServerHandle;
  let originalCwd: string;

  const sleep = (ms: number) =>
    new Promise((resolve) => setTimeout(resolve, ms));

  beforeAll(async () => {
    // Create test project structure
    mkdirSync(join(TEST_DIR, "src"), { recursive: true });
    mkdirSync(join(TEST_DIR, ".ts-graph-mcp"), { recursive: true });

    // Symlink models from repo root to avoid re-downloading (~300MB)
    const repoRoot = join(import.meta.dirname, "..", "..");
    const repoModelsDir = join(repoRoot, ".ts-graph-mcp", "models");
    symlinkSync(repoModelsDir, join(TEST_DIR, ".ts-graph-mcp", "models"));

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

    writeFileSync(
      join(TEST_DIR, "ts-graph-mcp.config.json"),
      JSON.stringify(
        {
          packages: [{ name: "main", tsconfig: "./tsconfig.json" }],
          server: { port: TEST_PORT },
          watch: { silent: true },
        },
        null,
        2,
      ),
    );

    // Create source file with distinctive name for topic search
    writeFileSync(
      join(TEST_DIR, "src/authentication.ts"),
      `/**
 * Validates user credentials for authentication.
 */
export function validateUserCredentials(username: string, password: string): boolean {
  return username.length > 0 && password.length > 8;
}

/**
 * Authenticates a user session.
 */
export function authenticateSession(token: string): boolean {
  return token.startsWith("valid_");
}
`,
    );

    // Change to test directory (server uses process.cwd())
    originalCwd = process.cwd();
    process.chdir(TEST_DIR);
  });

  afterAll(async () => {
    // Restore working directory
    process.chdir(originalCwd);

    // Clean up temp directory
    rmSync(TEST_DIR, { recursive: true, force: true });
  });

  it("topic search works after server restart", async () => {
    // Step 1: Start server (full indexing with embeddings)
    serverHandle = await startHttpServer([], { logger: silentLogger });
    await sleep(1000);

    // Step 2: Verify topic search works on first run
    // Use "login" — semantically related to authentication/credentials
    // but does NOT appear literally in the source code, file name, or JSDoc.
    // This ensures the test exercises vector/semantic search, not just BM25.
    const firstRunResponse = await fetch(
      `http://localhost:${TEST_PORT}/api/graph/search`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic: "login" }),
      },
    );
    const firstRunResult = await firstRunResponse.text();

    // Should find authentication-related symbols via semantic similarity
    expect(firstRunResult).toContain("validateUserCredentials");

    // Step 3: Stop the server
    await serverHandle.close();
    await sleep(500);

    // Step 4: Start server again (uses existing DB)
    serverHandle = await startHttpServer([], { logger: silentLogger });
    await sleep(1000);

    // Step 5: Verify topic search still works after restart
    const restartResponse = await fetch(
      `http://localhost:${TEST_PORT}/api/graph/search`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic: "login" }),
      },
    );
    const restartResult = await restartResponse.text();

    // This will FAIL if embeddings aren't restored from cache
    expect(restartResult).toContain("validateUserCredentials");

    // Clean up
    await serverHandle.close();
  }, 60_000); // 60s timeout for model loading
});
