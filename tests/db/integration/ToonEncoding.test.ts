import { encode } from "@toon-format/toon";
import type Database from "better-sqlite3";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ProjectConfig } from "../../../src/config/ConfigSchema.js";
import {
	closeDatabase,
	openDatabase,
} from "../../../src/db/sqlite/SqliteConnection.js";
import { createSqliteReader } from "../../../src/db/sqlite/SqliteReader.js";
import { createSqliteWriter } from "../../../src/db/sqlite/SqliteWriter.js";
import { indexProject } from "../../../src/ingestion/Ingestion.js";
import {
	groupNodesByType,
	formatSubgraphForToon,
	formatPathForToon,
} from "../../../src/mcp/McpServer.js";

const FIXTURES_DIR = join(__dirname, "../../../test-projects");

/**
 * These tests verify that all MCP responses use 100% condensed TOON format.
 * TOON uses condensed table format (e.g., "items[2]{a,b}:") when all objects
 * in an array have the same primitive-only structure. Nested objects/arrays
 * prevent condensed format, causing verbose "- key:" output.
 */
describe("MCP TOON output", () => {
	let db: Database.Database;

	beforeEach(() => {
		db = openDatabase({ path: ":memory:" });
	});

	afterEach(() => {
		closeDatabase(db);
	});

	describe(groupNodesByType.name, () => {
		it("produces condensed output for mixed node types", async () => {
			// Index the mixed-types fixture project
			const fixtureRoot = join(FIXTURES_DIR, "mixed-types");
			const config: ProjectConfig = {
				modules: [
					{
						name: "test",
						packages: [
							{
								name: "mixed-types",
								tsconfig: "tsconfig.json",
							},
						],
					},
				],
			};

			const writer = createSqliteWriter(db);
			const reader = createSqliteReader(db);

			await indexProject(config, writer, { projectRoot: fixtureRoot });

			// Query all nodes (like MCP search_nodes with "*")
			const nodes = await reader.searchNodes("*");

			// Group nodes by type (like MCP does) for TOON-optimal encoding
			const grouped = groupNodesByType(nodes);
			const encoded = encode({ count: nodes.length, ...grouped });

			// Should use condensed table format for each type group
			// e.g., "functions[2]{id,type,name,...}:" instead of "- id:"
			expect(encoded).toMatch(/functions\[\d+\]\{[^}]+\}:/);
			expect(encoded).toMatch(/classes\[\d+\]\{[^}]+\}:/);
			expect(encoded).not.toContain("- id:");
		});

		it("flattens parameters array to string", async () => {
			const fixtureRoot = join(FIXTURES_DIR, "mixed-types");
			const config: ProjectConfig = {
				modules: [
					{
						name: "test",
						packages: [{ name: "mixed-types", tsconfig: "tsconfig.json" }],
					},
				],
			};

			const writer = createSqliteWriter(db);
			const reader = createSqliteReader(db);
			await indexProject(config, writer, { projectRoot: fixtureRoot });

			const nodes = await reader.searchNodes("greet");
			expect(nodes.length).toBeGreaterThan(0);

			const grouped = groupNodesByType(nodes);
			const encoded = encode(grouped);

			// Parameters should be flattened to "name:type" format, not nested array
			// If we see "parameters[" it means nested array format (bad)
			expect(encoded).not.toMatch(/parameters\[\d+\]/);
			// Should see parameter info as string like "name:string"
			expect(encoded).toContain("name:string");
		});

		it("ensures all functions have consistent keys (returnType present)", async () => {
			// When some functions have returnType and others don't, TOON falls back
			// to verbose format. We need to ensure all optional fields are present
			// with empty values for condensed format to work.
			const fixtureRoot = join(FIXTURES_DIR, "mixed-types");
			const config: ProjectConfig = {
				modules: [
					{
						name: "test",
						packages: [{ name: "mixed-types", tsconfig: "tsconfig.json" }],
					},
				],
			};

			const writer = createSqliteWriter(db);
			const reader = createSqliteReader(db);
			await indexProject(config, writer, { projectRoot: fixtureRoot });

			const nodes = await reader.searchNodes("*", { nodeType: "Function" });
			expect(nodes.length).toBeGreaterThan(0);

			const grouped = groupNodesByType(nodes);
			const encoded = encode(grouped);

			// Verbose format uses "- id:" for each item
			// Condensed format uses "functions[N]{...}:" header with inline values
			expect(encoded).not.toContain("- id:");
			expect(encoded).toMatch(/functions\[\d+\]\{[^}]+\}:/);

			// All function keys should appear in the header (including returnType, async)
			expect(encoded).toMatch(/functions\[\d+\]\{[^}]*returnType[^}]*\}:/);
			expect(encoded).toMatch(/functions\[\d+\]\{[^}]*async[^}]*\}:/);
		});

		it("excludes 'type' field from grouped arrays (redundant with group name)", async () => {
			// When nodes are grouped by type (functions[], classes[], etc.),
			// including 'type' in each row is redundant - we already know the type from the group name
			const fixtureRoot = join(FIXTURES_DIR, "mixed-types");
			const config: ProjectConfig = {
				modules: [
					{
						name: "test",
						packages: [{ name: "mixed-types", tsconfig: "tsconfig.json" }],
					},
				],
			};

			const writer = createSqliteWriter(db);
			const reader = createSqliteReader(db);
			await indexProject(config, writer, { projectRoot: fixtureRoot });

			const nodes = await reader.searchNodes("*");
			expect(nodes.length).toBeGreaterThan(0);

			const grouped = groupNodesByType(nodes);
			const encoded = encode(grouped);

			// The 'type' field should NOT appear in any group header
			// e.g., should be "functions[N]{id,name,...}:" NOT "functions[N]{id,type,name,...}:"
			expect(encoded).not.toMatch(/functions\[\d+\]\{[^}]*\btype\b[^}]*\}:/);
			expect(encoded).not.toMatch(/classes\[\d+\]\{[^}]*\btype\b[^}]*\}:/);
			expect(encoded).not.toMatch(/interfaces\[\d+\]\{[^}]*\btype\b[^}]*\}:/);
			expect(encoded).not.toMatch(/variables\[\d+\]\{[^}]*\btype\b[^}]*\}:/);
			expect(encoded).not.toMatch(/files\[\d+\]\{[^}]*\btype\b[^}]*\}:/);
			expect(encoded).not.toMatch(/properties\[\d+\]\{[^}]*\btype\b[^}]*\}:/);
			expect(encoded).not.toMatch(/typeAliases\[\d+\]\{[^}]*\btype\b[^}]*\}:/);
			expect(encoded).not.toMatch(/methods\[\d+\]\{[^}]*\btype\b[^}]*\}:/);
		});
	});

	describe(formatSubgraphForToon.name, () => {
		it("produces condensed output for nodes (grouped by type)", async () => {
			const fixtureRoot = join(FIXTURES_DIR, "call-chain");
			const config: ProjectConfig = {
				modules: [
					{
						name: "test",
						packages: [{ name: "call-chain", tsconfig: "tsconfig.json" }],
					},
				],
			};

			const writer = createSqliteWriter(db);
			const reader = createSqliteReader(db);
			await indexProject(config, writer, { projectRoot: fixtureRoot });

			// Get neighbors creates a subgraph
			const subgraph = await reader.findNeighbors("src/chain.ts:funcA", {
				distance: 1,
				direction: "both",
			});

			const formatted = formatSubgraphForToon(subgraph);
			const encoded = encode(formatted);

			// Nodes are grouped by type, each group uses condensed table format
			// e.g., "functions[2]{id,type,...}:" instead of "nodes[3]:" with mixed types
			expect(encoded).toMatch(/functions\[\d+\]\{[^}]+\}:/);
			expect(encoded).toMatch(/files\[\d+\]\{[^}]+\}:/);
			// Should NOT have verbose "- id:" format
			expect(encoded).not.toContain("- id:");
		});

		it("produces condensed output for edges array", async () => {
			const fixtureRoot = join(FIXTURES_DIR, "call-chain");
			const config: ProjectConfig = {
				modules: [
					{
						name: "test",
						packages: [{ name: "call-chain", tsconfig: "tsconfig.json" }],
					},
				],
			};

			const writer = createSqliteWriter(db);
			const reader = createSqliteReader(db);
			await indexProject(config, writer, { projectRoot: fixtureRoot });

			const subgraph = await reader.findNeighbors("src/chain.ts:funcA", {
				distance: 1,
				direction: "both",
			});

			const formatted = formatSubgraphForToon(subgraph);
			const encoded = encode(formatted);

			// edges array should use condensed table format
			expect(encoded).toMatch(/edges\[\d+\]\{[^}]+\}:/);
		});

		it("flattens center node parameters", async () => {
			const fixtureRoot = join(FIXTURES_DIR, "cross-file-calls");
			const config: ProjectConfig = {
				modules: [
					{
						name: "test",
						packages: [{ name: "cross-file", tsconfig: "tsconfig.json" }],
					},
				],
			};

			const writer = createSqliteWriter(db);
			const reader = createSqliteReader(db);
			await indexProject(config, writer, { projectRoot: fixtureRoot });

			// The caller function should be in the index
			const subgraph = await reader.findNeighbors("src/main.ts:caller", {
				distance: 1,
				direction: "outgoing",
			});

			const formatted = formatSubgraphForToon(subgraph);
			const encoded = encode(formatted);

			// center node should not have nested parameters array
			expect(encoded).not.toMatch(/center:[\s\S]*?parameters\[\d+\]/);
		});

		it("excludes 'type' field from grouped node arrays", async () => {
			const fixtureRoot = join(FIXTURES_DIR, "call-chain");
			const config: ProjectConfig = {
				modules: [
					{
						name: "test",
						packages: [{ name: "call-chain", tsconfig: "tsconfig.json" }],
					},
				],
			};

			const writer = createSqliteWriter(db);
			const reader = createSqliteReader(db);
			await indexProject(config, writer, { projectRoot: fixtureRoot });

			const subgraph = await reader.findNeighbors("src/chain.ts:funcA", {
				distance: 1,
				direction: "both",
			});

			const formatted = formatSubgraphForToon(subgraph);
			const encoded = encode(formatted);

			// The 'type' field should NOT appear in any group header
			expect(encoded).not.toMatch(/functions\[\d+\]\{[^}]*\btype\b[^}]*\}:/);
			expect(encoded).not.toMatch(/files\[\d+\]\{[^}]*\btype\b[^}]*\}:/);
		});

		it("excludes 'type' field from center node", async () => {
			const fixtureRoot = join(FIXTURES_DIR, "call-chain");
			const config: ProjectConfig = {
				modules: [
					{
						name: "test",
						packages: [{ name: "call-chain", tsconfig: "tsconfig.json" }],
					},
				],
			};

			const writer = createSqliteWriter(db);
			const reader = createSqliteReader(db);
			await indexProject(config, writer, { projectRoot: fixtureRoot });

			const subgraph = await reader.findNeighbors("src/chain.ts:funcA", {
				distance: 1,
				direction: "both",
			});

			const formatted = formatSubgraphForToon(subgraph);
			const encoded = encode(formatted);

			// center node should not have 'type' field (redundant, we know it's a function)
			// The center block should NOT contain "type: Function"
			expect(encoded).not.toMatch(/center:[\s\S]*?\n\s+type:/);
		});
	});

	describe(formatPathForToon.name, () => {
		it("produces condensed output for path edges", async () => {
			const fixtureRoot = join(FIXTURES_DIR, "call-chain");
			const config: ProjectConfig = {
				modules: [
					{
						name: "test",
						packages: [{ name: "call-chain", tsconfig: "tsconfig.json" }],
					},
				],
			};

			const writer = createSqliteWriter(db);
			const reader = createSqliteReader(db);
			await indexProject(config, writer, { projectRoot: fixtureRoot });

			// Find path from funcA to funcC (A -> B -> C)
			const path = await reader.getPathBetween(
				"src/chain.ts:funcA",
				"src/chain.ts:funcC",
			);
			expect(path).not.toBeNull();

			const formatted = formatPathForToon(path);
			const encoded = encode(formatted);

			// edges array should use condensed table format
			expect(encoded).toMatch(/edges\[\d+\]\{[^}]+\}:/);
		});

		it("handles null path gracefully", () => {
			const formatted = formatPathForToon(null);
			const encoded = encode(formatted);

			expect(encoded).toContain("found: false");
			expect(encoded).toContain("No path found");
		});
	});
});
