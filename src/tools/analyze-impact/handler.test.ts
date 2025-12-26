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
import type { Edge, FunctionNode, InterfaceNode } from "../../db/Types.js";
import { executeAnalyzeImpact } from "./handler.js";

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

const iface = (
	name: string,
	file = "src/test.ts",
	module = "test",
): InterfaceNode => ({
	id: `${file}:${name}`,
	type: "Interface",
	name,
	module,
	package: "main",
	filePath: file,
	startLine: 1,
	endLine: 5,
	exported: true,
});

const calls = (from: string, to: string, callSites: number[] = []): Edge => ({
	source: from,
	target: to,
	type: "CALLS",
	callSites,
});

const usesType = (from: string, to: string): Edge => ({
	source: from,
	target: to,
	type: "USES_TYPE",
});

describe.skip(executeAnalyzeImpact.name, () => {
	let db: Database.Database;
	const testDir = join(process.cwd(), ".test-impact-handler");

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

	it("reports total impacted node count correctly", async () => {
		// Set up impact graph:
		// - Function C is called by B (CALLS)
		// - Function C is used as a type by D (USES_TYPE)
		// Total impacted: 2 nodes
		const writer = createSqliteWriter(db);
		const nodeB = fn("b", "src/b.ts");
		const nodeC = fn("c", "src/c.ts");
		const nodeD = fn("d", "src/d.ts");
		const interfaceC = iface("IConfig", "src/types.ts");

		await writer.addNodes([nodeB, nodeC, nodeD, interfaceC]);
		await writer.addEdges([
			calls(nodeB.id, nodeC.id, [5]), // B calls C
			usesType(nodeD.id, interfaceC.id), // D uses IConfig type
		]);

		// Execute handler for nodeC
		const output = executeAnalyzeImpact(db, { symbol: "c" }, "/nonexistent");

		// Should report 1 impacted node (only B calls C)
		expect(output).toContain("total: 1 impacted");

		// Execute handler for interfaceC
		const outputType = executeAnalyzeImpact(
			db,
			{ symbol: "IConfig" },
			"/nonexistent",
		);

		// Should report 1 impacted node (only D uses IConfig)
		expect(outputType).toContain("total: 1 impacted");
	});

	it("shows whole function body for small callers (≤10 lines)", async () => {
		// Create a small caller function
		const smallCallerCode = `import { target } from "./target";

export function smallCaller(input: string) {
  const result = target(input);
  return result;
}`;
		writeFileSync(join(testDir, "src/small.ts"), smallCallerCode);

		const targetCode = `export function target(x: string) {
  return x.toUpperCase();
}`;
		writeFileSync(join(testDir, "src/target.ts"), targetCode);

		const writer = createSqliteWriter(db);
		// Small caller: lines 3-6 (4 lines, under the 10-line threshold)
		const smallCaller = fn("smallCaller", "src/small.ts", "test", 3, 6);
		const target = fn("target", "src/target.ts", "test", 1, 3);
		await writer.addNodes([smallCaller, target]);
		await writer.addEdges([
			calls(smallCaller.id, target.id, [4]), // call at line 4
		]);

		const output = executeAnalyzeImpact(db, { symbol: "target" }, testDir);

		// For small functions, should show the WHOLE function body
		expect(output).toContain("export function smallCaller(input: string)");
		expect(output).toContain("const result = target(input)");
		expect(output).toContain("return result");
	});

	it("only shows snippets for CALLS edges, not other edge types", async () => {
		// Set up impact graph with multiple edge types:
		// - Function B calls C (CALLS edge - should have snippets)
		// - Function D uses IConfig type (USES_TYPE edge - no snippets)
		const callerCode = `import { target } from "./target";

export function caller(input: string) {
  const result = target(input);
  return result;
}`;
		writeFileSync(join(testDir, "src/caller.ts"), callerCode);

		const targetCode = `export function target(x: string) {
  return x.toUpperCase();
}

export interface IConfig {
  name: string;
}`;
		writeFileSync(join(testDir, "src/target.ts"), targetCode);

		const typeUserCode = `import type { IConfig } from "./target";

export function useType(config: IConfig) {
  return config.name;
}`;
		writeFileSync(join(testDir, "src/typeUser.ts"), typeUserCode);

		const writer = createSqliteWriter(db);
		const caller = fn("caller", "src/caller.ts", "test", 3, 6);
		const target = fn("target", "src/target.ts", "test", 1, 3);
		const interfaceConfig = iface("IConfig", "src/target.ts", "test");
		const typeUser = fn("useType", "src/typeUser.ts", "test", 3, 5);

		await writer.addNodes([caller, target, interfaceConfig, typeUser]);
		await writer.addEdges([
			calls(caller.id, target.id, [4]), // CALLS edge with call sites
			usesType(typeUser.id, interfaceConfig.id), // USES_TYPE edge (no call sites)
		]);

		const output = executeAnalyzeImpact(db, { symbol: "target" }, testDir);

		// Should show snippet for CALLS edge
		expect(output).toContain("const result = target(input)");

		const outputType = executeAnalyzeImpact(db, { symbol: "IConfig" }, testDir);

		// Should NOT show snippet for USES_TYPE edge (no call sites)
		// The output should have the function name but no code snippet
		expect(outputType).toContain("useType");
		// Should not contain the actual code snippet
		expect(outputType).not.toContain("return config.name");
	});
});
