/**
 * Shared report generator for benchmark results.
 * Used by all test project benchmarks.
 */

import type {
  BenchmarkPrompt,
  BenchmarkReport,
  BenchmarkRun,
  BenchmarkScenario,
  BenchmarkSummary,
} from "./types.js";

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function computeSummary(
  runs: BenchmarkRun[],
  prompt: BenchmarkPrompt,
  scenario: BenchmarkScenario,
): BenchmarkSummary {
  const relevantRuns = runs.filter(
    (r) => r.promptId === prompt.id && r.scenarioId === scenario.id,
  );

  const successfulRuns = relevantRuns.filter((r) => r.success);
  const validRuns = relevantRuns.filter((r) => r.answerValid);

  return {
    promptId: prompt.id,
    promptName: prompt.name,
    scenarioId: scenario.id,
    scenarioName: scenario.name,
    runs: relevantRuns.length,
    avgDurationMs: average(successfulRuns.map((r) => r.durationMs)),
    avgCostUsd: average(successfulRuns.map((r) => r.costUsd)),
    avgTurns: average(successfulRuns.map((r) => r.numTurns)),
    avgInputTokens: average(successfulRuns.map((r) => r.inputTokens)),
    avgOutputTokens: average(successfulRuns.map((r) => r.outputTokens)),
    successRate:
      relevantRuns.length > 0 ? successfulRuns.length / relevantRuns.length : 0,
    validationRate:
      relevantRuns.length > 0 ? validRuns.length / relevantRuns.length : 0,
  };
}

export function generateReport(
  runs: BenchmarkRun[],
  prompts: BenchmarkPrompt[],
  scenarios: BenchmarkScenario[],
  iterations: number,
  projectName: string,
): BenchmarkReport {
  const summaries: BenchmarkSummary[] = [];

  for (const prompt of prompts) {
    for (const scenario of scenarios) {
      summaries.push(computeSummary(runs, prompt, scenario));
    }
  }

  return {
    timestamp: new Date().toISOString(),
    projectName,
    iterations,
    runs,
    summaries,
  };
}

export function formatReportMarkdown(report: BenchmarkReport): string {
  const lines: string[] = [];

  lines.push(`# Benchmark Report: ${report.projectName}`);
  lines.push("");
  lines.push(`**Generated:** ${report.timestamp}`);
  lines.push(`**Iterations per scenario:** ${report.iterations}`);
  lines.push("");

  // Summary table
  lines.push("## Summary");
  lines.push("");
  lines.push(
    "| Prompt | Scenario | Avg Duration | Avg Cost | Avg Turns | Success | Valid |",
  );
  lines.push(
    "|--------|----------|--------------|----------|-----------|---------|-------|",
  );

  for (const s of report.summaries) {
    lines.push(
      `| ${s.promptId} (${s.promptName}) | ${s.scenarioName} | ${s.avgDurationMs.toFixed(0)}ms | $${s.avgCostUsd.toFixed(4)} | ${s.avgTurns.toFixed(1)} | ${(s.successRate * 100).toFixed(0)}% | ${(s.validationRate * 100).toFixed(0)}% |`,
    );
  }

  lines.push("");

  // Comparison section - show MCP benefits vs baseline (no MCP)
  lines.push("## 📊 MCP Benefits");
  lines.push("");
  lines.push("_Improvements from using MCP tools vs manual file reading._");
  lines.push("");

  const promptIds = [...new Set(report.summaries.map((s) => s.promptId))];

  for (const promptId of promptIds) {
    const withMcp = report.summaries.find(
      (s) => s.promptId === promptId && s.scenarioId === "with-mcp",
    );
    const withoutMcp = report.summaries.find(
      (s) => s.promptId === promptId && s.scenarioId === "without-mcp",
    );

    if (withMcp && withoutMcp) {
      lines.push(`### ${promptId}: ${withMcp.promptName}`);
      lines.push("");

      // Skip comparison if baseline failed (no successful runs)
      if (withoutMcp.successRate === 0) {
        lines.push("⚠️ _Baseline failed - comparison not available_");
        lines.push("");
        continue;
      }

      // Calculate deltas (negative = MCP is better)
      const timeDeltaMs = withMcp.avgDurationMs - withoutMcp.avgDurationMs;
      const costDelta = withMcp.avgCostUsd - withoutMcp.avgCostUsd;
      const turnDelta = withMcp.avgTurns - withoutMcp.avgTurns;

      // Format time comparison
      const timeIcon = timeDeltaMs <= 0 ? "✅" : "❌";
      const timePct =
        withoutMcp.avgDurationMs > 0
          ? Math.abs((timeDeltaMs / withoutMcp.avgDurationMs) * 100)
          : 0;
      const timeLabel =
        timeDeltaMs <= 0
          ? `${timePct.toFixed(0)}% faster`
          : `${timePct.toFixed(0)}% slower`;

      // Format cost comparison
      const costIcon = costDelta <= 0 ? "✅" : "❌";
      const costPct =
        withoutMcp.avgCostUsd > 0
          ? Math.abs((costDelta / withoutMcp.avgCostUsd) * 100)
          : 0;
      const costLabel =
        costDelta <= 0
          ? `${costPct.toFixed(0)}% cheaper`
          : `${costPct.toFixed(0)}% more`;

      // Format turns comparison
      const turnIcon = turnDelta <= 0 ? "✅" : "❌";
      const turnLabel =
        turnDelta < 0
          ? `${Math.abs(turnDelta).toFixed(0)} fewer`
          : turnDelta > 0
            ? `${turnDelta.toFixed(0)} more`
            : "same";

      lines.push("| Metric | Without MCP | With MCP | Δ | Result |");
      lines.push("|:-------|------------:|---------:|--:|:-------|");
      lines.push(
        `| ⏱️ Time | ${(withoutMcp.avgDurationMs / 1000).toFixed(1)}s | ${(withMcp.avgDurationMs / 1000).toFixed(1)}s | ${(timeDeltaMs / 1000).toFixed(1)}s | ${timeIcon} **${timeLabel}** |`,
      );
      lines.push(
        `| 💰 Cost | $${withoutMcp.avgCostUsd.toFixed(2)} | $${withMcp.avgCostUsd.toFixed(2)} | ${costDelta >= 0 ? "+" : ""}$${costDelta.toFixed(2)} | ${costIcon} **${costLabel}** |`,
      );
      lines.push(
        `| 🔄 Turns | ${withoutMcp.avgTurns.toFixed(0)} | ${withMcp.avgTurns.toFixed(0)} | ${turnDelta >= 0 ? "+" : ""}${turnDelta.toFixed(0)} | ${turnIcon} **${turnLabel}** |`,
      );
      lines.push("");
    }
  }

  // Raw data section
  lines.push("## 📋 Raw Data");
  lines.push("");
  lines.push("| # | Prompt | Scenario | Duration | Cost | Turns | Valid |");
  lines.push("|--:|--------|----------|----------|------|------:|:-----:|");

  for (let i = 0; i < report.runs.length; i++) {
    const r = report.runs[i];
    lines.push(
      `| ${i + 1} | ${r.promptId} | ${r.scenarioId} | ${r.durationMs}ms | $${r.costUsd.toFixed(4)} | ${r.numTurns} | ${r.answerValid ? "✅" : "❌"} |`,
    );
  }

  return lines.join("\n");
}

/**
 * Print comparison summary to console.
 */
export function printComparison(
  report: BenchmarkReport,
  prompts: BenchmarkPrompt[],
): void {
  console.log(`\n${"-".repeat(60)}`);
  console.log("MCP COMPARISON");
  console.log("-".repeat(60));

  for (const prompt of prompts) {
    const withMcp = report.summaries.find(
      (s) => s.promptId === prompt.id && s.scenarioId === "with-mcp",
    );
    const withoutMcp = report.summaries.find(
      (s) => s.promptId === prompt.id && s.scenarioId === "without-mcp",
    );

    if (withMcp && withoutMcp) {
      console.log(`${prompt.id} (${prompt.name}):`);

      // Skip comparison if baseline failed (no successful runs)
      if (withoutMcp.successRate === 0) {
        console.log("  ⚠️  Baseline failed - comparison not available");
        continue;
      }

      // Calculate deltas (negative = MCP is better)
      const timeDelta = withMcp.avgDurationMs - withoutMcp.avgDurationMs;
      const costDelta = withMcp.avgCostUsd - withoutMcp.avgCostUsd;

      const timePct =
        withoutMcp.avgDurationMs > 0
          ? Math.abs((timeDelta / withoutMcp.avgDurationMs) * 100)
          : 0;
      const costPct =
        withoutMcp.avgCostUsd > 0
          ? Math.abs((costDelta / withoutMcp.avgCostUsd) * 100)
          : 0;

      const timeLabel =
        timeDelta <= 0
          ? `✅ ${timePct.toFixed(0)}% faster`
          : `❌ ${timePct.toFixed(0)}% slower`;
      const costLabel =
        costDelta <= 0
          ? `✅ ${costPct.toFixed(0)}% cheaper`
          : `❌ ${costPct.toFixed(0)}% more expensive`;

      console.log(`  Time: ${timeLabel}`);
      console.log(`  Cost: ${costLabel}`);
    }
  }
}
