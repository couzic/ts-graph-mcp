#!/usr/bin/env npx tsx
/**
 * Benchmark runner for deep-chain test project.
 *
 * Usage:
 *   npx tsx benchmark/run.ts              # Run benchmarks (1 run, 3 concurrent)
 *   npx tsx benchmark/run.ts --runs 5     # Multiple runs per prompt/scenario
 *   npx tsx benchmark/run.ts -r 3         # Short form
 *   npx tsx benchmark/run.ts --prompt P1  # Run specific prompt only
 *   npx tsx benchmark/run.ts --scenario with-mcp  # Run specific scenario only
 *   npx tsx benchmark/run.ts --concurrency 5      # Run with 5 concurrent (default: 3)
 *   npx tsx benchmark/run.ts --sequential         # Run one at a time
 */

import { join } from "node:path";
import { parseArgs } from "node:util";
import {
	scenarios,
	generateReport,
	printComparison,
	runBenchmarkIteration,
	checkDatabase,
	saveResults,
	type BenchmarkRun,
	type BenchmarkPrompt,
	type BenchmarkScenario,
} from "../../../benchmark/lib/index.js";
import { prompts, PROJECT_NAME } from "./prompts.js";

const DEFAULT_RUNS = 1;
const DEFAULT_CONCURRENCY = 3;
const DB_PATH = ".ts-graph/graph.db";

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

function getProjectRoot(): string {
	return join(import.meta.dirname, "..");
}

function parseCliArgs(): RunnerOptions {
	const { values } = parseArgs({
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
		runs,
		promptFilter: values.prompt,
		scenarioFilter: values.scenario,
		verbose: values.verbose ?? false,
		concurrency,
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

async function main() {
	const options = parseCliArgs();
	const projectRoot = getProjectRoot();

	// Check database exists
	checkDatabase(projectRoot, DB_PATH);

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

	const totalRuns =
		selectedPrompts.length * selectedScenarios.length * options.runs;

	const mode = options.concurrency > 1
		? `parallel (${options.concurrency} concurrent)`
		: "sequential";

	console.log("=".repeat(60));
	console.log(`BENCHMARK: ${PROJECT_NAME}`);
	console.log("=".repeat(60));
	console.log(`Prompts:    ${selectedPrompts.map((p) => p.id).join(", ")}`);
	console.log(`Scenarios:  ${selectedScenarios.map((s) => s.id).join(", ")}`);
	console.log(`Runs:       ${options.runs}`);
	console.log(`Total runs: ${totalRuns}`);
	console.log(`Mode:       ${mode}`);
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

		if (options.concurrency === 1) {
			console.log(
				`[${taskIndex}/${totalRuns}] ${prompt.id} | ${scenario.id} | iteration ${iteration}`,
			);
		}

		const run = await runBenchmarkIteration(
			prompt,
			scenario,
			iteration,
			projectRoot,
			options.verbose,
		);

		const status = run.success
			? run.answerValid
				? "✅"
				: "⚠️ (invalid)"
			: "❌ (error)";

		console.log(
			`[${taskIndex}/${totalRuns}] ${prompt.id} | ${scenario.id} | iter ${iteration} → ${status} ${run.durationMs}ms | $${run.costUsd.toFixed(4)} | ${run.numTurns} turns`,
		);

		return run;
	};

	// Run tasks (always use runWithConcurrency, concurrency=1 is sequential)
	if (options.concurrency > 1) {
		console.log(`Starting ${totalRuns} runs with ${options.concurrency} concurrent...\n`);
	}
	const runs = await runWithConcurrency(tasks, options.concurrency, executeTask);

	// Generate report
	const report = generateReport(
		runs,
		selectedPrompts,
		selectedScenarios,
		options.runs,
		PROJECT_NAME,
	);

	// Save results to benchmark/results/deep-chain/
	const resultsDir = join(import.meta.dirname, "../../../benchmark/results", PROJECT_NAME);
	const jsonPath = await saveResults(resultsDir, report);
	console.log(`\nResults saved to: ${jsonPath}`);

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

main().catch((err) => {
	console.error("Benchmark failed:", err);
	process.exit(1);
});
