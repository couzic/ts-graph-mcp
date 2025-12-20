#!/usr/bin/env npx tsx
/**
 * Shared benchmark runner for test projects.
 *
 * Usage:
 *   npx tsx benchmark/lib/run.ts sample-projects/deep-chain
 *   npx tsx benchmark/lib/run.ts sample-projects/deep-chain --runs 5
 *   npx tsx benchmark/lib/run.ts sample-projects/deep-chain --prompt P1
 *   npx tsx benchmark/lib/run.ts sample-projects/deep-chain --scenario with-mcp
 *   npx tsx benchmark/lib/run.ts sample-projects/deep-chain --concurrency 5
 *   npx tsx benchmark/lib/run.ts sample-projects/deep-chain --sequential
 *
 * The test project must have a benchmark/prompts.ts that exports:
 *   - config: BenchmarkConfig
 *   - prompts: BenchmarkPrompt[]
 */

import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { scenarios } from "./scenarios.js";
import { generateReport, formatReportMarkdown, printComparison } from "./report.js";
import { runBenchmarkIteration, checkDatabase, saveResults } from "./runner.js";
import type { BenchmarkRun, BenchmarkPrompt, BenchmarkConfig } from "./types.js";
import type { BenchmarkScenario } from "./types.js";

const DEFAULT_RUNS = 1;
const DEFAULT_CONCURRENCY = 3;
const DEFAULT_DB_PATH = ".ts-graph/graph.db";

interface RunnerOptions {
	runs: number;
	promptFilter?: string;
	scenarioFilter?: string;
	verbose: boolean;
	concurrency: number;
}

interface BenchmarkTask {
	prompt: BenchmarkPrompt;
	scenario: BenchmarkScenario;
	iteration: number;
	index: number;
}

function parseCliArgs(): { projectPath?: string; options: RunnerOptions } {
	const { values, positionals } = parseArgs({
		allowPositionals: true,
		options: {
			runs: { type: "string", short: "r" },
			prompt: { type: "string" },
			scenario: { type: "string" },
			verbose: { type: "boolean", short: "v", default: false },
			concurrency: { type: "string", short: "c" },
			sequential: { type: "boolean", default: false },
		},
	});

	// Default to parallel, --sequential disables it
	let concurrency = DEFAULT_CONCURRENCY;
	if (values.sequential) {
		concurrency = 1;
	} else if (values.concurrency !== undefined) {
		const parsed = Number.parseInt(values.concurrency, 10);
		if (!Number.isNaN(parsed) && parsed > 0) {
			concurrency = parsed;
		}
	}

	// Parse runs (default: 1)
	let runs = DEFAULT_RUNS;
	if (values.runs !== undefined) {
		const parsed = Number.parseInt(values.runs, 10);
		if (!Number.isNaN(parsed) && parsed > 0) {
			runs = parsed;
		}
	}

	return {
		projectPath: positionals[0],
		options: {
			runs,
			promptFilter: values.prompt,
			scenarioFilter: values.scenario,
			verbose: values.verbose ?? false,
			concurrency,
		},
	};
}

/**
 * Run tasks with bounded concurrency.
 * Executes up to `concurrency` tasks simultaneously.
 */
async function runWithConcurrency<T, R>(
	items: T[],
	concurrency: number,
	fn: (item: T) => Promise<R>,
): Promise<R[]> {
	const results: R[] = [];
	const executing: Promise<void>[] = [];

	for (const item of items) {
		const promise = fn(item).then((result) => {
			results.push(result);
		});

		executing.push(promise);

		if (executing.length >= concurrency) {
			await Promise.race(executing);
			// Remove completed promises
			for (let i = executing.length - 1; i >= 0; i--) {
				// Check if promise is settled by racing with immediate resolve
				const settled = await Promise.race([
					executing[i].then(() => true),
					Promise.resolve(false),
				]);
				if (settled) {
					executing.splice(i, 1);
				}
			}
		}
	}

	await Promise.all(executing);
	return results;
}

/**
 * Run benchmarks for a test project.
 */
export async function runBenchmarks(
	config: BenchmarkConfig,
	prompts: BenchmarkPrompt[],
	options: RunnerOptions,
): Promise<void> {
	const dbPath = config.dbPath ?? DEFAULT_DB_PATH;

	// Check database exists
	checkDatabase(config.projectRoot, dbPath);

	// Filter prompts and scenarios
	const selectedPrompts = options.promptFilter
		? prompts.filter((p) => p.id === options.promptFilter)
		: prompts;

	const selectedScenarios = options.scenarioFilter
		? scenarios.filter((s) => s.id === options.scenarioFilter)
		: scenarios;

	if (selectedPrompts.length === 0) {
		console.error(`No prompts match filter: ${options.promptFilter}`);
		process.exit(1);
	}

	if (selectedScenarios.length === 0) {
		console.error(`No scenarios match filter: ${options.scenarioFilter}`);
		process.exit(1);
	}

	const totalTasks = selectedPrompts.length * selectedScenarios.length * options.runs;

	console.log("=".repeat(60));
	console.log(`BENCHMARK: ${config.projectName}`);
	console.log("=".repeat(60));
	console.log(`Prompts:      ${selectedPrompts.map((p) => p.id).join(", ")}`);
	console.log(`Scenarios:    ${selectedScenarios.map((s) => s.id).join(", ")}`);
	console.log(`Iterations:   ${options.runs} per prompt/scenario`);
	console.log(`Total tasks:  ${totalTasks}`);
	console.log(`Concurrency:  ${options.concurrency} parallel`);
	console.log("=".repeat(60));
	console.log("");

	// Build task list
	const tasks: BenchmarkTask[] = [];
	let index = 0;
	for (const prompt of selectedPrompts) {
		for (const scenario of selectedScenarios) {
			for (let i = 1; i <= options.runs; i++) {
				tasks.push({ prompt, scenario, iteration: i, index: ++index });
			}
		}
	}

	// Execute task and log result
	const executeTask = async (task: BenchmarkTask): Promise<BenchmarkRun> => {
		const { prompt, scenario, iteration, index: taskIndex } = task;

		// Show progress when task starts
		const taskLabel = `[${taskIndex}/${totalTasks}] ${prompt.id} | ${scenario.id}`;
		if (options.concurrency === 1) {
			console.log(`${taskLabel} | iteration ${iteration}`);
		} else {
			console.log(`${taskLabel} starting...`);
		}

		const run = await runBenchmarkIteration(
			prompt,
			scenario,
			iteration,
			config.projectRoot,
			options.verbose,
		);

		const status = run.success
			? run.answerValid
				? "✅"
				: "⚠️ (invalid)"
			: "❌ (error)";

		const duration = (run.durationMs / 1000).toFixed(1);
		console.log(
			`${taskLabel} → ${status} ${duration}s | $${run.costUsd.toFixed(2)} | ${run.numTurns} turns`,
		);

		return run;
	};

	// Run tasks
	console.log(`Running ${totalTasks} tasks (${options.concurrency} parallel)...\n`);
	const runs = await runWithConcurrency(tasks, options.concurrency, executeTask);

	// Generate report
	const report = generateReport(
		runs,
		selectedPrompts,
		selectedScenarios,
		options.runs,
		config.projectName,
	);

	// Save results to benchmark/results/<project>/
	const resultsDir = join(import.meta.dirname, "../results", config.projectName);
	const markdown = formatReportMarkdown(report);
	const { jsonPath, mdPath } = await saveResults(resultsDir, report, markdown);
	console.log(`\nResults saved to:`);
	console.log(`  JSON: ${jsonPath}`);
	console.log(`  MD:   ${mdPath}`);

	// Print summary to console
	console.log("\n" + "=".repeat(60));
	console.log("SUMMARY");
	console.log("=".repeat(60));

	for (const summary of report.summaries) {
		console.log(
			`${summary.promptId} | ${summary.scenarioName}: ${summary.avgDurationMs.toFixed(0)}ms avg, $${summary.avgCostUsd.toFixed(4)} avg`,
		);
	}

	// Print comparison
	printComparison(report, selectedPrompts);
}

/**
 * CLI entry point: loads config and prompts from test project and runs benchmarks.
 */
async function main() {
	const { projectPath, options } = parseCliArgs();

	if (!projectPath) {
		console.error("Usage: npx tsx benchmark/lib/run.ts <test-project-path> [options]");
		console.error("");
		console.error("Options:");
		console.error("  --runs, -r <n>       Number of iterations per prompt/scenario (default: 1)");
		console.error("  --prompt <id>        Run specific prompt only (e.g., P1)");
		console.error("  --scenario <id>      Run specific scenario only (e.g., with-mcp)");
		console.error("  --concurrency, -c <n> Number of parallel tasks (default: 3)");
		console.error("  --sequential         Run one task at a time");
		console.error("  --verbose, -v        Show detailed execution info");
		console.error("");
		console.error("Example:");
		console.error("  npx tsx benchmark/lib/run.ts sample-projects/deep-chain --runs 3");
		process.exit(1);
	}

	const fullProjectPath = resolve(projectPath);
	const promptsPath = join(fullProjectPath, "benchmark", "prompts.js");

	// Dynamic import of the test project's prompts.ts (compiled to .js)
	let module: { config: BenchmarkConfig; prompts: BenchmarkPrompt[] };
	try {
		module = await import(promptsPath);
	} catch {
		console.error(`ERROR: Could not load ${promptsPath}`);
		console.error("");
		console.error("Make sure the test project has benchmark/prompts.ts that exports:");
		console.error("  export const config: BenchmarkConfig = { ... }");
		console.error("  export const prompts: BenchmarkPrompt[] = [ ... ]");
		console.error("");
		console.error("And that the project has been built (npm run build)");
		process.exit(1);
	}

	if (!module.config) {
		console.error(`ERROR: ${promptsPath} does not export a 'config' object`);
		process.exit(1);
	}

	if (!module.prompts || module.prompts.length === 0) {
		console.error(`ERROR: ${promptsPath} does not export a 'prompts' array`);
		process.exit(1);
	}

	await runBenchmarks(module.config, module.prompts, options);
}

// Only run main if this is the entry point
const isMainModule = import.meta.url === `file://${process.argv[1]}`;
if (isMainModule) {
	main().catch((err) => {
		console.error("Benchmark failed:", err);
		process.exit(1);
	});
}
