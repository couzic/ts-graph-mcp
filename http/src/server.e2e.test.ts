import assert from "node:assert";
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { silentLogger } from "./logger.js";
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
    expect(symbols[0]!.symbol).toBe("entry");
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
    expect(symbols[0]!.symbol).toBe("newFunction");
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
    expect(symbols[0]!.symbol).toBe("brandNew");
  });
});
