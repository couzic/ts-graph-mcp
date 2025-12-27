/**
 * Historical comparison utilities for benchmark reporting.
 * Compares current runs against historical averages.
 */

import { getHistoricalRuns } from "./history.js";
import type {
  BenchmarkHistory,
  BenchmarkPrompt,
  BenchmarkRun,
  HistoricalComparison,
  HistoricalStats,
} from "./types.js";
import { average, formatMetricChange } from "./utils.js";

/**
 * Calculate aggregate statistics from a list of runs.
 * Returns null if no runs are provided.
 */
export function calculateStats(runs: BenchmarkRun[]): HistoricalStats | null {
  if (runs.length === 0) {
    return null;
  }

  const successfulRuns = runs.filter((r) => r.success);
  const validRuns = runs.filter((r) => r.answerValid);

  return {
    runCount: runs.length,
    avgDurationMs: average(runs.map((r) => r.durationMs)),
    avgCostUsd: average(runs.map((r) => r.costUsd)),
    avgTurns: average(runs.map((r) => r.numTurns)),
    successRate: successfulRuns.length / runs.length,
    validationRate: validRuns.length / runs.length,
  };
}

/**
 * Generate historical comparisons for the current run.
 * Compares current WITH_MCP runs against:
 * - Historical WITHOUT_MCP average
 * - Historical WITH_MCP average (for trend analysis)
 */
export function generateComparison(
  currentRuns: BenchmarkRun[],
  prompts: BenchmarkPrompt[],
  history: BenchmarkHistory,
): HistoricalComparison[] {
  const comparisons: HistoricalComparison[] = [];

  // Get timestamps of current WITH_MCP runs (to exclude from trend comparison)
  const currentWithMcpTimestamps = new Set(
    currentRuns
      .filter((r) => r.scenarioId === "with-mcp")
      .map((r) => r.timestamp),
  );

  for (const prompt of prompts) {
    const promptText = prompt.prompt;

    // Get current WITH_MCP runs for this prompt
    const currentWithMcp = currentRuns.filter(
      (r) => r.promptId === prompt.id && r.scenarioId === "with-mcp",
    );

    // If no current runs, try to build comparison from history only
    const currentStats = calculateStats(currentWithMcp);

    // Get all runs from history
    const allWithoutMcp = getHistoricalRuns(history, promptText, "without-mcp");
    const allWithMcp = getHistoricalRuns(history, promptText, "with-mcp");

    // WITHOUT_MCP baseline: include ALL runs (current + past) since they're all valid baseline data
    // WITH_MCP trend: exclude current runs to compare against past performance
    const pastWithMcp = allWithMcp.filter(
      (r) => !currentWithMcpTimestamps.has(r.timestamp),
    );

    const historicalWithoutMcpStats = calculateStats(allWithoutMcp);
    const historicalWithMcpStats = calculateStats(pastWithMcp);

    // Only include if we have something to compare
    if (currentStats || historicalWithoutMcpStats || historicalWithMcpStats) {
      comparisons.push({
        promptText,
        promptId: prompt.id,
        currentWithMcp: currentStats ?? {
          runCount: 0,
          avgDurationMs: 0,
          avgCostUsd: 0,
          avgTurns: 0,
          successRate: 0,
          validationRate: 0,
        },
        historicalWithoutMcp: historicalWithoutMcpStats,
        historicalWithMcp: historicalWithMcpStats,
      });
    }
  }

  return comparisons;
}

/**
 * Print historical comparison to console.
 * Compares current WITH_MCP runs against historical WITHOUT_MCP baseline.
 */
export function printHistoricalComparison(
  comparisons: HistoricalComparison[],
): void {
  // Filter to only comparisons with baseline data
  const withBaseline = comparisons.filter(
    (c) => c.historicalWithoutMcp !== null,
  );

  if (withBaseline.length === 0) {
    console.log(`\n${"-".repeat(60)}`);
    console.log("HISTORICAL COMPARISON");
    console.log("-".repeat(60));
    console.log("No historical WITHOUT_MCP baseline data yet.");
    console.log("Run benchmarks a few more times to build baseline.");
    return;
  }

  console.log(`\n${"-".repeat(60)}`);
  console.log("MCP vs BASELINE (historical averages)");
  console.log("-".repeat(60));

  for (const c of withBaseline) {
    const current = c.currentWithMcp;
    const baseline = c.historicalWithoutMcp as HistoricalStats;

    const time = formatMetricChange(
      current.avgDurationMs,
      baseline.avgDurationMs,
      "time",
    );
    const cost = formatMetricChange(
      current.avgCostUsd,
      baseline.avgCostUsd,
      "cost",
    );

    console.log(`${c.promptId} (vs ${baseline.runCount} baseline runs):`);
    console.log(`  ⏱️  Time: ${time.icon} ${time.pct} ${time.direction}`);
    console.log(`  💰 Cost: ${cost.icon} ${cost.pct} ${cost.direction}`);

    // Also show trend vs past WITH_MCP runs
    if (c.historicalWithMcp && c.historicalWithMcp.runCount > 0) {
      const past = c.historicalWithMcp;
      const trendTime = formatMetricChange(
        current.avgDurationMs,
        past.avgDurationMs,
        "time",
      );
      const trendCost = formatMetricChange(
        current.avgCostUsd,
        past.avgCostUsd,
        "cost",
      );

      console.log(`  vs ${past.runCount} past WITH_MCP runs:`);
      console.log(
        `    ⏱️  Time: ${trendTime.icon} ${trendTime.pct} ${trendTime.direction}`,
      );
      console.log(
        `    💰 Cost: ${trendCost.icon} ${trendCost.pct} ${trendCost.direction}`,
      );
    }
  }
}
