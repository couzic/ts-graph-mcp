/**
 * Shared benchmark runner utilities.
 * Used by all test project benchmarks.
 */

import type { ChildProcess } from "node:child_process";
import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type {
  BenchmarkPrompt,
  BenchmarkRun,
  BenchmarkScenario,
  ClaudeJsonOutput,
} from "./types.js";

const DELAY_BETWEEN_RUNS_MS = 2000;
const HEALTH_CHECK_TIMEOUT_MS = 120000;
const HEALTH_CHECK_INTERVAL_MS = 500;

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
  maxTurns: number,
): Promise<ClaudeJsonOutput> {
  return new Promise((resolve, reject) => {
    const { cmd, baseArgs } = getClaudeCommand();
    const args = [
      ...baseArgs,
      "-p",
      prompt,
      "--output-format",
      "json",
      "--max-turns",
      String(maxTurns),
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

  // Calculate effective maxTurns for CLI (default: 20)
  const effectiveMaxTurns = prompt.maxTurns ?? 20;

  try {
    const output = await runClaude(
      prompt.prompt,
      scenario,
      projectRoot,
      verbose,
      effectiveMaxTurns,
    );

    // Only check expectedTurns limit for WITH MCP scenario (id: "with-mcp")
    const turnLimitExceeded =
      scenario.id === "with-mcp" && output.num_turns > prompt.expectedTurns;

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
      turnLimitExceeded,
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
      turnLimitExceeded: false,
      result: error instanceof Error ? error.message : String(error),
    };
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

// =============================================================================
// HTTP Server Management
// =============================================================================

interface HealthCheckResult {
  ok: boolean;
  indexed_files?: number;
  error?: string;
}

/**
 * Check if the HTTP server is running and has indexed files.
 */
export async function checkHttpServer(
  port: number,
): Promise<HealthCheckResult> {
  try {
    const response = await fetch(`http://localhost:${port}/health`);
    if (!response.ok) {
      return { ok: false, error: `Health check returned ${response.status}` };
    }
    const data = (await response.json()) as {
      status: string;
      ready: boolean;
      indexed_files: number;
    };
    if (!data.ready) {
      return { ok: false, error: "Server not ready" };
    }
    if (data.indexed_files === 0) {
      return { ok: false, error: "No files indexed" };
    }
    return { ok: true, indexed_files: data.indexed_files };
  } catch {
    return { ok: false, error: "Server not running" };
  }
}

/**
 * Wait for the HTTP server to become ready.
 */
async function waitForServer(port: number): Promise<HealthCheckResult> {
  const startTime = Date.now();
  while (Date.now() - startTime < HEALTH_CHECK_TIMEOUT_MS) {
    const result = await checkHttpServer(port);
    if (result.ok) {
      return result;
    }
    await sleep(HEALTH_CHECK_INTERVAL_MS);
  }
  return { ok: false, error: "Timeout waiting for server to start" };
}

let httpServerProcess: ChildProcess | null = null;

/**
 * Start the HTTP server in background.
 * Returns the port and process, or null if failed.
 */
export async function startHttpServer(
  projectRoot: string,
): Promise<{ port: number; process: ChildProcess } | null> {
  // Load config to get port
  const { loadConfigOrDetect } = await import(
    "../../http/src/config/configLoader.utils.js"
  );
  const configResult = loadConfigOrDetect(projectRoot);
  const port = configResult?.config.server?.port;

  if (!port) {
    console.error(
      "ERROR: No port configured. Add server.port to ts-graph-mcp.config.json",
    );
    return null;
  }

  // Check if server is already running
  const existingCheck = await checkHttpServer(port);
  if (existingCheck.ok) {
    console.log(
      `HTTP server already running on port ${port} (${existingCheck.indexed_files} files indexed)`,
    );
    return { port, process: null as unknown as ChildProcess };
  }

  console.log(`Starting HTTP server on port ${port}...`);

  // Start the server
  const mainJs = join(import.meta.dirname, "../../dist/main.js");
  const proc = spawn("node", [mainJs], {
    cwd: projectRoot,
    stdio: ["ignore", "pipe", "pipe"],
    detached: false,
  });

  httpServerProcess = proc;

  // Collect stderr for debugging
  let stderr = "";
  proc.stderr?.on("data", (data) => {
    stderr += data.toString();
  });

  // Wait for server to become ready
  const result = await waitForServer(port);
  if (!result.ok) {
    console.error(`Failed to start HTTP server: ${result.error}`);
    console.error("Server stderr:", stderr.slice(0, 500));
    proc.kill();
    httpServerProcess = null;
    return null;
  }

  console.log(`HTTP server ready (${result.indexed_files} files indexed)`);
  return { port, process: proc };
}

/**
 * Stop the HTTP server if we started it.
 */
export function stopHttpServer(): void {
  if (httpServerProcess) {
    console.log("Stopping HTTP server...");
    httpServerProcess.kill("SIGTERM");
    httpServerProcess = null;
  }
}

/**
 * Check if we started the HTTP server (vs it was already running).
 */
export function didWeStartServer(): boolean {
  return httpServerProcess !== null;
}
