#!/usr/bin/env npx tsx
/**
 * Shared setup script for benchmark test projects.
 *
 * Pre-indexes a test project into a SQLite database so the MCP server
 * has data ready for benchmarks.
 *
 * Usage:
 *   npx tsx benchmark/lib/setup.ts sample-projects/deep-chain
 *   npx tsx benchmark/lib/setup.ts sample-projects/mixed-types
 *
 * The test project must have a benchmark/prompts.ts that exports a `config` object.
 */

import { access } from "node:fs/promises";
import { mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { closeDatabase, openDatabase } from "../../src/db/sqlite/SqliteConnection.js";
import { initializeSchema } from "../../src/db/sqlite/SqliteSchema.js";
import { createSqliteWriter } from "../../src/db/sqlite/SqliteWriter.js";
import { indexProject } from "../../src/ingestion/Ingestion.js";
import type { ProjectConfig } from "../../src/config/ConfigSchema.js";
import type { BenchmarkConfig } from "./types.js";

const DEFAULT_DB_PATH = ".ts-graph/graph.db";
const PROJECT_CONFIG_EXTENSIONS = [".ts", ".js"] as const;

/**
 * Try to load the project's ts-graph-mcp.config.(ts|js) if it exists.
 * Returns undefined if not found.
 */
async function tryLoadProjectConfig(projectRoot: string): Promise<ProjectConfig | undefined> {
	for (const ext of PROJECT_CONFIG_EXTENSIONS) {
		const configPath = join(projectRoot, `ts-graph-mcp.config${ext}`);
		try {
			await access(configPath);
			const module = await import(configPath);
			return module.default as ProjectConfig;
		} catch {
			// Try next extension
		}
	}
	return undefined;
}

/**
 * Run the benchmark setup for a test project.
 * Indexes the project into a SQLite database.
 */
export async function setupBenchmark(config: BenchmarkConfig): Promise<void> {
	const dbPath = config.dbPath ?? DEFAULT_DB_PATH;
	const fullDbPath = join(config.projectRoot, dbPath);

	console.log("=".repeat(50));
	console.log(`SETUP: Pre-indexing ${config.projectName} for benchmarks`);
	console.log("=".repeat(50));
	console.log(`Project root: ${config.projectRoot}`);
	console.log(`Database: ${fullDbPath}`);
	console.log("");

	// Create directory if needed
	const dbDir = join(config.projectRoot, ".ts-graph");
	await mkdir(dbDir, { recursive: true });

	// Open database (will create if doesn't exist)
	const db = openDatabase({ path: fullDbPath });
	initializeSchema(db);

	// Try to load the project's actual config file first (for multi-module/package projects)
	// Fall back to creating a flat config from benchmark config
	const loadedConfig = await tryLoadProjectConfig(config.projectRoot);
	const projectConfig: ProjectConfig = loadedConfig ?? {
		modules: [
			{
				name: config.moduleName ?? config.projectName,
				packages: [
					{
						name: config.packageName ?? "main",
						tsconfig: config.tsconfig,
					},
				],
			},
		],
	};

	if (loadedConfig) {
		const moduleCount = loadedConfig.modules.length;
		const packageCount = loadedConfig.modules.reduce((sum, m) => sum + m.packages.length, 0);
		console.log(`Loaded project config: ${moduleCount} modules, ${packageCount} packages`);
	} else {
		console.log("Using flat config (single module/package)");
	}

	// Index the project
	console.log("Indexing project...");
	const writer = createSqliteWriter(db);
	const result = await indexProject(projectConfig, writer, {
		projectRoot: config.projectRoot,
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

/**
 * CLI entry point: loads config from test project's prompts.ts and runs setup.
 */
async function main() {
	const args = process.argv.slice(2);

	if (args.length === 0) {
		console.error("Usage: npx tsx benchmark/lib/setup.ts <test-project-path>");
		console.error("");
		console.error("Example:");
		console.error("  npx tsx benchmark/lib/setup.ts sample-projects/deep-chain");
		process.exit(1);
	}

	const projectPath = resolve(args[0]);
	const promptsPath = join(projectPath, "benchmark", "prompts.js");

	// Dynamic import of the test project's prompts.ts (compiled to .js)
	let module: { config: BenchmarkConfig };
	try {
		module = await import(promptsPath);
	} catch {
		console.error(`ERROR: Could not load ${promptsPath}`);
		console.error("");
		console.error("Make sure the test project has benchmark/prompts.ts that exports:");
		console.error("  export const config: BenchmarkConfig = { ... }");
		console.error("");
		console.error("And that the project has been built (npm run build)");
		process.exit(1);
	}

	if (!module.config) {
		console.error(`ERROR: ${promptsPath} does not export a 'config' object`);
		process.exit(1);
	}

	await setupBenchmark(module.config);
}

// Only run main if this is the entry point
const isMainModule = import.meta.url === `file://${process.argv[1]}`;
if (isMainModule) {
	main().catch((err) => {
		console.error("Setup failed:", err);
		process.exit(1);
	});
}
