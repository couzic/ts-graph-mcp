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

	// Comparison section
	lines.push("## Comparison: WITH MCP vs WITHOUT MCP");
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
			const timeDiff =
				withMcp.avgDurationMs > 0
					? ((withoutMcp.avgDurationMs - withMcp.avgDurationMs) /
							withMcp.avgDurationMs) *
						100
					: 0;
			const costDiff =
				withMcp.avgCostUsd > 0
					? ((withoutMcp.avgCostUsd - withMcp.avgCostUsd) / withMcp.avgCostUsd) *
						100
					: 0;

			lines.push(`### ${promptId}: ${withMcp.promptName}`);
			lines.push("");
			lines.push("| Metric | WITH MCP | WITHOUT MCP | Difference |");
			lines.push("|--------|----------|-------------|------------|");
			lines.push(
				`| Duration | ${withMcp.avgDurationMs.toFixed(0)}ms | ${withoutMcp.avgDurationMs.toFixed(0)}ms | ${timeDiff > 0 ? "+" : ""}${timeDiff.toFixed(1)}% |`,
			);
			lines.push(
				`| Cost | $${withMcp.avgCostUsd.toFixed(4)} | $${withoutMcp.avgCostUsd.toFixed(4)} | ${costDiff > 0 ? "+" : ""}${costDiff.toFixed(1)}% |`,
			);
			lines.push(
				`| Turns | ${withMcp.avgTurns.toFixed(1)} | ${withoutMcp.avgTurns.toFixed(1)} | - |`,
			);
			lines.push("");
		}
	}

	// Raw data section
	lines.push("## Raw Data");
	lines.push("");
	lines.push("| # | Prompt | Scenario | Duration | Cost | Turns | Valid |");
	lines.push("|---|--------|----------|----------|------|-------|-------|");

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
	console.log("COMPARISON (WITH MCP vs WITHOUT MCP)");
	console.log("-".repeat(60));

	for (const prompt of prompts) {
		const withMcp = report.summaries.find(
			(s) => s.promptId === prompt.id && s.scenarioId === "with-mcp",
		);
		const withoutMcp = report.summaries.find(
			(s) => s.promptId === prompt.id && s.scenarioId === "without-mcp",
		);

		if (withMcp && withoutMcp) {
			const timeDiff =
				((withoutMcp.avgDurationMs - withMcp.avgDurationMs) /
					withMcp.avgDurationMs) *
				100;
			const costDiff =
				((withoutMcp.avgCostUsd - withMcp.avgCostUsd) / withMcp.avgCostUsd) *
				100;

			console.log(`${prompt.id} (${prompt.name}):`);
			console.log(
				`  Time: ${timeDiff > 0 ? "+" : ""}${timeDiff.toFixed(1)}% ${timeDiff > 0 ? "(MCP faster)" : "(MCP slower)"}`,
			);
			console.log(
				`  Cost: ${costDiff > 0 ? "+" : ""}${costDiff.toFixed(1)}% ${costDiff > 0 ? "(MCP cheaper)" : "(MCP more expensive)"}`,
			);
		}
	}
}
