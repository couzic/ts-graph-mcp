#!/usr/bin/env npx tsx
/**
 * Shared setup script for benchmark test projects.
 *
 * Pre-indexes a test project into a SQLite database so the MCP server
 * has data ready for benchmarks.
 *
 * Usage:
 *   npx tsx benchmark/lib/setup.ts sample-projects/call-chain
 *   npx tsx benchmark/lib/setup.ts sample-projects/mixed-types
 *
 * The test project must have a benchmark/prompts.ts that exports a `config` object.
 */

import { access, mkdir, unlink } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { ProjectConfig } from "../../src/config/Config.schemas.js";
import { createSqliteWriter } from "../../src/db/sqlite/createSqliteWriter.js";
import {
  closeDatabase,
  openDatabase,
} from "../../src/db/sqlite/sqliteConnection.utils.js";
import { initializeSchema } from "../../src/db/sqlite/sqliteSchema.utils.js";
import { indexProject } from "../../src/ingestion/indexProject.js";
import type { BenchmarkConfig } from "./types.js";

const DEFAULT_DB_PATH = ".ts-graph/graph.db";
const PROJECT_CONFIG_EXTENSIONS = [".ts", ".js"] as const;

/**
 * Try to load the project's ts-graph-mcp.config.(ts|js) if it exists.
 * Returns undefined if not found.
 */
async function tryLoadProjectConfig(
  projectRoot: string,
): Promise<ProjectConfig | undefined> {
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

  // Delete existing database and WAL files to ensure fresh schema
  // This avoids schema mismatch errors when columns are added/removed
  // SQLite WAL mode creates .db-wal and .db-shm files that must be deleted together
  const filesToDelete = [fullDbPath, `${fullDbPath}-wal`, `${fullDbPath}-shm`];
  let deletedAny = false;
  for (const file of filesToDelete) {
    try {
      await unlink(file);
      deletedAny = true;
    } catch {
      // File doesn't exist, that's fine
    }
  }
  if (deletedAny) {
    console.log("Deleted existing database (ensuring fresh schema)");
  }

  // Open database (will create if doesn't exist)
  const db = openDatabase({ path: fullDbPath });
  initializeSchema(db);

  // Try to load the project's actual config file first (for multi-package projects)
  // Fall back to creating a flat config from benchmark config
  const loadedConfig = await tryLoadProjectConfig(config.projectRoot);
  const projectConfig: ProjectConfig = loadedConfig ?? {
    packages: [
      {
        name: config.packageName ?? "main",
        tsconfig: config.tsconfig,
      },
    ],
  };

  if (loadedConfig) {
    console.log(
      `Loaded project config: ${loadedConfig.packages.length} packages`,
    );
  } else {
    console.log("Using flat config (single package)");
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
  const nodeCount = db.prepare("SELECT COUNT(*) as count FROM nodes").get() as {
    count: number;
  };
  const edgeCount = db.prepare("SELECT COUNT(*) as count FROM edges").get() as {
    count: number;
  };
  const callEdges = db
    .prepare("SELECT COUNT(*) as count FROM edges WHERE type = 'CALLS'")
    .get() as { count: number };

  console.log("");
  console.log("Verification:");
  console.log(`  Total nodes: ${nodeCount.count}`);
  console.log(`  Total edges: ${edgeCount.count}`);
  console.log(`  CALLS edges: ${callEdges.count}`);

  // List some sample nodes
  const sampleNodes = db
    .prepare("SELECT id, name, type FROM nodes WHERE type = 'Function' LIMIT 5")
    .all();
  console.log("");
  console.log("Sample function nodes:");
  for (const node of sampleNodes as Array<{
    id: string;
    name: string;
    type: string;
  }>) {
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
    console.error(
      "  npx tsx benchmark/lib/setup.ts sample-projects/call-chain",
    );
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
    console.error(
      "Make sure the test project has benchmark/prompts.ts that exports:",
    );
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
