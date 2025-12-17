/**
 * Shared benchmark runner utilities.
 * Used by all test project benchmarks.
 */

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type {
	BenchmarkPrompt,
	BenchmarkRun,
	BenchmarkScenario,
	ClaudeJsonOutput,
} from "./types.js";

const DELAY_BETWEEN_RUNS_MS = 2000;

/**
 * Get the Claude CLI command and arguments.
 *
 * Priority:
 * 1. CLAUDE_PATH env var (user override)
 * 2. npx @anthropic-ai/claude-code (works anywhere npm is installed)
 */
function getClaudeCommand(): { cmd: string; baseArgs: string[] } {
	const claudePath = process.env.CLAUDE_PATH;
	if (claudePath) {
		// User-specified path (e.g., /home/user/.claude/local/claude)
		return { cmd: claudePath, baseArgs: [] };
	}
	// Fall back to npx (slower but always works)
	return { cmd: "npx", baseArgs: ["@anthropic-ai/claude-code"] };
}

/**
 * Run Claude CLI with the given prompt and scenario.
 */
export async function runClaude(
	prompt: string,
	scenario: BenchmarkScenario,
	projectRoot: string,
	verbose: boolean,
): Promise<ClaudeJsonOutput> {
	return new Promise((resolve, reject) => {
		const { cmd, baseArgs } = getClaudeCommand();
		const args = [
			...baseArgs,
			"-p",
			prompt,
			"--output-format",
			"json",
			...scenario.cliFlags,
		];

		if (verbose) {
			console.log(`  Running: ${cmd} ${args.join(" ").slice(0, 80)}...`);
		}

		const proc = spawn(cmd, args, {
			cwd: projectRoot,
			env: {
				...process.env,
				// Disable caching for fair comparison
				DISABLE_PROMPT_CACHING: "1",
			},
			stdio: ["ignore", "pipe", "pipe"],
		});

		let stdout = "";
		let stderr = "";

		proc.stdout.on("data", (data) => {
			stdout += data.toString();
		});

		proc.stderr.on("data", (data) => {
			stderr += data.toString();
		});

		proc.on("close", (code) => {
			if (code !== 0) {
				reject(new Error(`Claude exited with code ${code}: ${stderr}`));
				return;
			}

			try {
				const json = JSON.parse(stdout) as ClaudeJsonOutput;
				resolve(json);
			} catch {
				reject(new Error(`Failed to parse Claude output: ${stdout}`));
			}
		});

		proc.on("error", (err) => {
			reject(new Error(`Failed to spawn claude: ${err.message}`));
		});
	});
}

/**
 * Validate that the answer contains expected strings.
 */
export function validateAnswer(
	result: string,
	prompt: BenchmarkPrompt,
): boolean {
	const lowerResult = result.toLowerCase();
	return prompt.expectedContains.every((expected) =>
		lowerResult.includes(expected.toLowerCase()),
	);
}

/**
 * Sleep for the given number of milliseconds.
 */
export function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Run a single benchmark iteration.
 */
export async function runBenchmarkIteration(
	prompt: BenchmarkPrompt,
	scenario: BenchmarkScenario,
	iteration: number,
	projectRoot: string,
	verbose: boolean,
): Promise<BenchmarkRun> {
	const timestamp = new Date().toISOString();

	try {
		const output = await runClaude(
			prompt.prompt,
			scenario,
			projectRoot,
			verbose,
		);

		return {
			promptId: prompt.id,
			scenarioId: scenario.id,
			iteration,
			timestamp,
			durationMs: output.duration_ms,
			durationApiMs: output.duration_api_ms,
			costUsd: output.total_cost_usd,
			numTurns: output.num_turns,
			inputTokens: output.usage.input_tokens,
			outputTokens: output.usage.output_tokens,
			cacheCreationTokens: output.usage.cache_creation_input_tokens,
			cacheReadTokens: output.usage.cache_read_input_tokens,
			success: !output.is_error,
			answerValid: validateAnswer(output.result, prompt),
			result: output.result,
		};
	} catch (error) {
		return {
			promptId: prompt.id,
			scenarioId: scenario.id,
			iteration,
			timestamp,
			durationMs: 0,
			durationApiMs: 0,
			costUsd: 0,
			numTurns: 0,
			inputTokens: 0,
			outputTokens: 0,
			cacheCreationTokens: 0,
			cacheReadTokens: 0,
			success: false,
			answerValid: false,
			result: error instanceof Error ? error.message : String(error),
		};
	}
}

/**
 * Check that the database exists before running benchmarks.
 */
export function checkDatabase(projectRoot: string, dbPath: string): void {
	const fullPath = join(projectRoot, dbPath);
	if (!existsSync(fullPath)) {
		console.error("ERROR: Database not found at", fullPath);
		console.error("");
		console.error("Run setup first. From project root:");
		console.error("  npm run benchmark:setup");
		process.exit(1);
	}
}

export interface SaveResultsOutput {
	jsonPath: string;
	mdPath?: string;
}

/**
 * Save benchmark results to JSON and optionally markdown files.
 */
export async function saveResults(
	resultsDir: string,
	report: object,
	markdown?: string,
): Promise<SaveResultsOutput> {
	await mkdir(resultsDir, { recursive: true });
	const timestamp = new Date().toISOString().replace(/[:.]/g, "-");

	const jsonPath = join(resultsDir, `run-${timestamp}.json`);
	await writeFile(jsonPath, JSON.stringify(report, null, 2));

	let mdPath: string | undefined;
	if (markdown) {
		mdPath = join(resultsDir, `run-${timestamp}.md`);
		await writeFile(mdPath, markdown);
	}

	return { jsonPath, mdPath };
}

/**
 * Get the delay between runs.
 */
export function getDelayBetweenRuns(): number {
	return DELAY_BETWEEN_RUNS_MS;
}
