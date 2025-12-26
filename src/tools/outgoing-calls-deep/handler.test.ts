import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type Database from "better-sqlite3";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";
import { createSqliteWriter } from "../../db/sqlite/createSqliteWriter.js";
import {
  closeDatabase,
  openDatabase,
} from "../../db/sqlite/sqliteConnection.utils.js";
import { initializeSchema } from "../../db/sqlite/sqliteSchema.utils.js";
import type { Edge, FunctionNode } from "../../db/Types.js";
import { executeOutgoingCallsDeep } from "./handler.js";

// Test data factory - creates minimal function nodes
const fn = (
  name: string,
  file = "src/test.ts",
  module = "test",
  startLine = 1,
  endLine = 10,
): FunctionNode => ({
  id: `${file}:${name}`,
  type: "Function",
  name,
  module,
  package: "main",
  filePath: file,
  startLine,
  endLine,
  exported: true,
});

const calls = (from: string, to: string, callSites: number[] = []): Edge => ({
  source: from,
  target: to,
  type: "CALLS",
  callSites,
});

describe.skip(executeOutgoingCallsDeep.name, () => {
  let db: Database.Database;
  const testDir = join(process.cwd(), ".test-handler-outgoing");

  beforeAll(() => {
    mkdirSync(join(testDir, "src"), { recursive: true });
  });

  afterAll(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  beforeEach(() => {
    db = openDatabase({ path: ":memory:" });
    initializeSchema(db);
  });

  afterEach(() => {
    closeDatabase(db);
  });

  it("reports total transitive callee count, not just direct callees", async () => {
    // Set up a transitive call chain: A → B → C
    // A has 2 callees (B directly, C transitively)
    const writer = createSqliteWriter(db);
    const nodeA = fn("a", "src/a.ts");
    const nodeB = fn("b", "src/b.ts");
    const nodeC = fn("c", "src/c.ts");
    await writer.addNodes([nodeA, nodeB, nodeC]);
    await writer.addEdges([
      calls(nodeA.id, nodeB.id, [5]), // A calls B at line 5
      calls(nodeB.id, nodeC.id, [3]), // B calls C at line 3
    ]);

    // Execute handler (files don't exist, snippets will be empty)
    const output = executeOutgoingCallsDeep(
      db,
      { symbol: "a" },
      "/nonexistent",
    );

    // Both direct callee (B) and transitive callee (C) should be included
    expect(output).toContain("callees[2]:");
  });

  it("shows whole function body for small callees (≤10 lines)", async () => {
    // Create a small callee function
    // Source function calls target at a specific line
    const sourceCode = `import { smallTarget } from "./target";

export function source(input: string) {
  const result = smallTarget(input);
  return result;
}`;
    writeFileSync(join(testDir, "src/source.ts"), sourceCode);

    // Small callee that will be shown in full
    const targetCode = `export function smallTarget(x: string) {
  const validated = validate(x);
  const processed = process(validated);
  return processed;
}`;
    // Function spans lines 1-5 (5 lines, under the 10-line threshold)
    writeFileSync(join(testDir, "src/target.ts"), targetCode);

    const writer = createSqliteWriter(db);
    const source = fn("source", "src/source.ts", "test", 3, 6);
    // Small callee: lines 1-5 (5 lines, under the 10-line threshold)
    const smallTarget = fn("smallTarget", "src/target.ts", "test", 1, 5);
    await writer.addNodes([source, smallTarget]);
    await writer.addEdges([
      calls(source.id, smallTarget.id, [4]), // source calls smallTarget at line 4
    ]);

    const output = executeOutgoingCallsDeep(db, { symbol: "source" }, testDir);

    // For small functions, should show the WHOLE function body
    expect(output).toContain("export function smallTarget(x: string)");
    expect(output).toContain("const validated = validate(x)");
    expect(output).toContain("return processed");
  });
});
