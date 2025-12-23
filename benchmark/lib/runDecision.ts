/**
 * Run decision logic for skipping scenarios based on history.
 */

import { getHistoricalRuns } from "./history.js";
import type { BenchmarkHistory } from "./types.js";

export interface RunDecision {
	shouldRun: boolean;
	reason: "always" | "bootstrap" | "sufficient";
	existingCount: number;
}

/**
 * Decide whether to run a scenario based on history.
 *
 * Rules:
 * - with-mcp: Always run (we want fresh measurements)
 * - without-mcp with <minRuns runs: Run to build baseline (bootstrap)
 * - without-mcp with >=minRuns runs: Skip (sufficient history)
 */
export function shouldRunScenario(
	promptText: string,
	scenarioId: string,
	history: BenchmarkHistory,
	minRuns: number,
): RunDecision {
	// WITH_MCP always runs
	if (scenarioId === "with-mcp") {
		return {
			shouldRun: true,
			reason: "always",
			existingCount: 0,
		};
	}

	// For WITHOUT_MCP, check history
	const existingRuns = getHistoricalRuns(history, promptText, scenarioId);
	const existingCount = existingRuns.length;

	if (existingCount >= minRuns) {
		return {
			shouldRun: false,
			reason: "sufficient",
			existingCount,
		};
	}

	return {
		shouldRun: true,
		reason: "bootstrap",
		existingCount,
	};
}
