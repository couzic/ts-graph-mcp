/**
 * History file management for persistent benchmark results.
 * Stores all runs in a single history.json per project.
 */

import { existsSync } from "node:fs";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type {
  BenchmarkHistory,
  BenchmarkPrompt,
  BenchmarkRun,
} from "./types.js";

const HISTORY_FILENAME = "history.json";

/**
 * Get the path to history.json for a project.
 */
export function getHistoryPath(projectName: string): string {
  return join(import.meta.dirname, "../results", projectName, HISTORY_FILENAME);
}

/**
 * Get the results directory for a project.
 */
function getResultsDir(projectName: string): string {
  return join(import.meta.dirname, "../results", projectName);
}

/**
 * Create an empty history for a project.
 */
function createEmptyHistory(projectName: string): BenchmarkHistory {
  return {
    version: 1,
    projectName,
    lastUpdated: new Date().toISOString(),
    prompts: {},
  };
}

/**
 * Load history.json for a project.
 * Returns empty history if file doesn't exist.
 */
export async function loadHistory(
  projectName: string,
): Promise<BenchmarkHistory> {
  const path = getHistoryPath(projectName);

  if (!existsSync(path)) {
    return createEmptyHistory(projectName);
  }

  try {
    const content = await readFile(path, "utf-8");
    const history = JSON.parse(content) as BenchmarkHistory;

    // Validate version
    if (history.version !== 1) {
      console.warn(
        `History version mismatch: expected 1, got ${history.version}. Starting fresh.`,
      );
      return createEmptyHistory(projectName);
    }

    return history;
  } catch (error) {
    console.warn(`Failed to load history: ${error}. Starting fresh.`);
    return createEmptyHistory(projectName);
  }
}

/**
 * Save history.json atomically (write to temp, then rename).
 */
export async function saveHistory(history: BenchmarkHistory): Promise<string> {
  const dir = getResultsDir(history.projectName);
  await mkdir(dir, { recursive: true });

  const path = getHistoryPath(history.projectName);
  const tempPath = `${path}.tmp`;

  // Update timestamp
  history.lastUpdated = new Date().toISOString();

  // Write to temp file first
  await writeFile(tempPath, JSON.stringify(history, null, 2));

  // Atomic rename
  await rename(tempPath, path);

  return path;
}

/**
 * Get historical runs for a specific prompt and scenario.
 */
export function getHistoricalRuns(
  history: BenchmarkHistory,
  promptText: string,
  scenarioId: string,
): BenchmarkRun[] {
  const promptHistory = history.prompts[promptText];
  if (!promptHistory) {
    return [];
  }

  if (scenarioId === "with-mcp") {
    return promptHistory.withMcpRuns;
  }
  if (scenarioId === "without-mcp") {
    return promptHistory.withoutMcpRuns;
  }

  return [];
}

/**
 * Append runs to history and save.
 * Creates prompt entries if they don't exist.
 * Deduplicates by timestamp to prevent duplicate entries.
 */
export async function appendRuns(
  projectName: string,
  runs: BenchmarkRun[],
  prompts: BenchmarkPrompt[],
): Promise<BenchmarkHistory> {
  const history = await loadHistory(projectName);

  for (const run of runs) {
    // Find the prompt definition to get the prompt text
    const promptDef = prompts.find((p) => p.id === run.promptId);
    if (!promptDef) {
      console.warn(
        `Prompt ${run.promptId} not found in prompts array, skipping run`,
      );
      continue;
    }

    // Don't save invalid WITHOUT_MCP runs — they shouldn't count toward skip threshold
    if (run.scenarioId === "without-mcp" && !run.answerValid) {
      continue;
    }

    const promptText = promptDef.prompt;

    // Create prompt history if it doesn't exist
    if (!history.prompts[promptText]) {
      history.prompts[promptText] = {
        promptId: promptDef.id,
        promptName: promptDef.name,
        withMcpRuns: [],
        withoutMcpRuns: [],
      };
    }

    const promptHistory = history.prompts[promptText];

    // Update display fields (may have changed)
    promptHistory.promptId = promptDef.id;
    promptHistory.promptName = promptDef.name;

    // Get the appropriate runs array
    const runsArray =
      run.scenarioId === "with-mcp"
        ? promptHistory.withMcpRuns
        : promptHistory.withoutMcpRuns;

    // Deduplicate by timestamp
    const existingIndex = runsArray.findIndex(
      (r) => r.timestamp === run.timestamp,
    );
    if (existingIndex === -1) {
      runsArray.push(run);
    }
  }

  await saveHistory(history);
  return history;
}
