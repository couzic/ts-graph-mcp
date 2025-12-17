/**
 * Shared report generator for benchmark results.
 * Used by all test project benchmarks.
 */

import type {
	BenchmarkPrompt,
	BenchmarkRun,
	BenchmarkReport,
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
	lines.push(
		"_Improvements from using MCP tools vs manual file reading._",
	);
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
			// Calculate improvements (how much better MCP is)
			const speedup =
				withMcp.avgDurationMs > 0
					? withoutMcp.avgDurationMs / withMcp.avgDurationMs
					: 1;
			const costReduction =
				withoutMcp.avgCostUsd > 0
					? ((withMcp.avgCostUsd - withoutMcp.avgCostUsd) /
							withoutMcp.avgCostUsd) *
						100
					: 0;
			const turnReduction =
				withoutMcp.avgTurns > 0
					? ((withMcp.avgTurns - withoutMcp.avgTurns) / withoutMcp.avgTurns) *
						100
					: 0;

			// Calculate absolute differences
			const timeDelta = withMcp.avgDurationMs - withoutMcp.avgDurationMs;
			const costDelta = withMcp.avgCostUsd - withoutMcp.avgCostUsd;
			const turnDelta = withMcp.avgTurns - withoutMcp.avgTurns;

			lines.push(`### ${promptId}: ${withMcp.promptName}`);
			lines.push("");
			lines.push("| Metric | Without MCP | With MCP | Δ | Improvement |");
			lines.push("|:-------|------------:|---------:|--:|:------------|");
			lines.push(
				`| ⏱️ Time | ${(withoutMcp.avgDurationMs / 1000).toFixed(1)}s | ${(withMcp.avgDurationMs / 1000).toFixed(1)}s | ${(timeDelta / 1000).toFixed(1)}s | ✅ **${speedup.toFixed(1)}×** faster |`,
			);
			lines.push(
				`| 💰 Cost | $${withoutMcp.avgCostUsd.toFixed(2)} | $${withMcp.avgCostUsd.toFixed(2)} | ${costDelta >= 0 ? "" : "-"}$${Math.abs(costDelta).toFixed(2)} | ✅ **${costReduction.toFixed(0)}%** |`,
			);
			lines.push(
				`| 🔄 Turns | ${withoutMcp.avgTurns.toFixed(0)} | ${withMcp.avgTurns.toFixed(0)} | ${turnDelta.toFixed(0)} | ✅ **${turnReduction.toFixed(0)}%** |`,
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
	console.log("\n" + "-".repeat(60));
	console.log("MCP BENEFITS");
	console.log("-".repeat(60));

	for (const prompt of prompts) {
		const withMcp = report.summaries.find(
			(s) => s.promptId === prompt.id && s.scenarioId === "with-mcp",
		);
		const withoutMcp = report.summaries.find(
			(s) => s.promptId === prompt.id && s.scenarioId === "without-mcp",
		);

		if (withMcp && withoutMcp) {
			const speedup =
				withMcp.avgDurationMs > 0
					? withoutMcp.avgDurationMs / withMcp.avgDurationMs
					: 1;
			const costSavings =
				withoutMcp.avgCostUsd > 0
					? ((withoutMcp.avgCostUsd - withMcp.avgCostUsd) /
							withoutMcp.avgCostUsd) *
						100
					: 0;

			console.log(`${prompt.id} (${prompt.name}):`);
			console.log(`  Speed: ${speedup.toFixed(1)}× faster`);
			console.log(`  Cost:  ${costSavings.toFixed(0)}% cheaper`);
		}
	}
}
