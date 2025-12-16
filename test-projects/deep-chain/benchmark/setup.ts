#!/usr/bin/env npx tsx
/**
 * Setup script for deep-chain benchmarks.
 *
 * Pre-indexes the deep-chain project into a SQLite database
 * so the MCP server has data ready for benchmarks.
 *
 * Usage:
 *   npx tsx benchmark/setup.ts
 */

import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { closeDatabase, openDatabase } from "../../../src/db/sqlite/SqliteConnection.js";
import { initializeSchema } from "../../../src/db/sqlite/SqliteSchema.js";
import { createSqliteWriter } from "../../../src/db/sqlite/SqliteWriter.js";
import { indexProject } from "../../../src/ingestion/Ingestion.js";
import type { ProjectConfig } from "../../../src/config/ConfigSchema.js";

const DB_PATH = ".ts-graph/graph.db";

async function main() {
	const projectRoot = join(import.meta.dirname, "..");
	const dbPath = join(projectRoot, DB_PATH);

	console.log("=".repeat(50));
	console.log("SETUP: Pre-indexing deep-chain for benchmarks");
	console.log("=".repeat(50));
	console.log(`Project root: ${projectRoot}`);
	console.log(`Database: ${dbPath}`);
	console.log("");

	// Create directory if needed
	await mkdir(join(projectRoot, ".ts-graph"), { recursive: true });

	// Open database (will create if doesn't exist)
	const db = openDatabase({ path: dbPath });
	initializeSchema(db);

	// Define project config
	const config: ProjectConfig = {
		modules: [
			{
				name: "deep-chain",
				packages: [{ name: "main", tsconfig: "tsconfig.json" }],
			},
		],
	};

	// Index the project
	console.log("Indexing project...");
	const writer = createSqliteWriter(db);
	const result = await indexProject(config, writer, {
		projectRoot,
		clearFirst: true, // Fresh index each time
	});

	console.log("");
	console.log("Results:");
	console.log(`  Files processed: ${result.filesProcessed}`);
	console.log(`  Nodes added: ${result.nodesAdded}`);
	console.log(`  Edges added: ${result.edgesAdded}`);
	console.log(`  Duration: ${result.durationMs}ms`);

	if (result.errors && result.errors.length > 0) {
		console.log(`  Errors: ${result.errors.length}`);
		for (const error of result.errors) {
			console.log(`    - ${error.file}: ${error.message}`);
		}
	}

	// Verify data
	const nodeCount = db.prepare("SELECT COUNT(*) as count FROM nodes").get() as { count: number };
	const edgeCount = db.prepare("SELECT COUNT(*) as count FROM edges").get() as { count: number };
	const callEdges = db.prepare("SELECT COUNT(*) as count FROM edges WHERE type = 'CALLS'").get() as { count: number };

	console.log("");
	console.log("Verification:");
	console.log(`  Total nodes: ${nodeCount.count}`);
	console.log(`  Total edges: ${edgeCount.count}`);
	console.log(`  CALLS edges: ${callEdges.count}`);

	// List some sample nodes
	const sampleNodes = db.prepare("SELECT id, name, type FROM nodes WHERE type = 'Function' LIMIT 5").all();
	console.log("");
	console.log("Sample function nodes:");
	for (const node of sampleNodes as Array<{ id: string; name: string; type: string }>) {
		console.log(`  - ${node.id}`);
	}

	closeDatabase(db);

	console.log("");
	console.log("=".repeat(50));
	console.log("Setup complete! Ready for benchmarks.");
	console.log("=".repeat(50));
}

main().catch((err) => {
	console.error("Setup failed:", err);
	process.exit(1);
});
