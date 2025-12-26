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
import { executeIncomingCallsDeep } from "./handler.js";

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

describe.skip(executeIncomingCallsDeep.name, () => {
	let db: Database.Database;
	const testDir = join(process.cwd(), ".test-handler");

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

	it("reports total transitive caller count, not just direct callers", async () => {
		// Set up a transitive call chain: A → B → C
		// C has 2 callers (A transitively, B directly)
		// but only B has call_sites (direct call)
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
		const output = executeIncomingCallsDeep(
			db,
			{ symbol: "c" },
			"/nonexistent",
		);

		// Both direct caller (B) and transitive caller (A) should be included
		expect(output).toContain("callers[2]:");
	});

	it("shows whole function body for small callers (≤10 lines)", async () => {
		// Create a small caller function where the call is at the END
		// With default 3-line context, we'd miss the function signature
		const smallCallerCode = `import { target } from "./target";

export function smallCaller(input: string) {
  const validated = validate(input);
  const processed = process(validated);
  const formatted = format(processed);
  const result = target(formatted);
  return result;
}`;
		// Function spans lines 3-9 (7 lines), call to target is at line 8
		// With 3-line context around line 8, we'd show lines 5-11
		// which MISSES the function signature on line 3
		writeFileSync(join(testDir, "src/small.ts"), smallCallerCode);

		// Create target function
		const targetCode = `export function target(x: string) {
  return x.toUpperCase();
}`;
		writeFileSync(join(testDir, "src/target.ts"), targetCode);

		const writer = createSqliteWriter(db);
		// Small caller: lines 3-9 (7 lines, under the 10-line threshold)
		const smallCaller = fn("smallCaller", "src/small.ts", "test", 3, 9);
		const target = fn("target", "src/target.ts", "test", 1, 3);
		await writer.addNodes([smallCaller, target]);
		await writer.addEdges([
			calls(smallCaller.id, target.id, [8]), // call is near the end
		]);

		const output = executeIncomingCallsDeep(db, { symbol: "target" }, testDir);

		// For small functions, should show the WHOLE function body
		// including the signature, not just context around the call site
		expect(output).toContain("export function smallCaller(input: string)");
		expect(output).toContain("const validated = validate(input)");
		expect(output).toContain("return result");
	});
});
