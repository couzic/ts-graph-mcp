/**
 * Shared types for benchmark results.
 * Used by all test project benchmarks.
 */

/**
 * Configuration for a benchmark test project.
 * This is the minimal config needed to add benchmarks to a test project.
 */
export interface BenchmarkConfig {
	/** Unique name for this test project (used in results directory) */
	projectName: string;
	/** Absolute path to the test project root */
	projectRoot: string;
	/** Relative path to tsconfig.json from projectRoot */
	tsconfig: string;
	/** Module name for the project config (defaults to projectName) */
	moduleName?: string;
	/** Package name for the project config (defaults to "main") */
	packageName?: string;
	/** Relative path to database from projectRoot (defaults to ".ts-graph/graph.db") */
	dbPath?: string;
}

export interface ClaudeJsonOutput {
	type: "result";
	subtype: "success" | "error";
	is_error: boolean;
	duration_ms: number;
	duration_api_ms: number;
	num_turns: number;
	result: string;
	session_id: string;
	total_cost_usd: number;
	usage: {
		input_tokens: number;
		cache_creation_input_tokens: number;
		cache_read_input_tokens: number;
		output_tokens: number;
	};
}

export interface BenchmarkPrompt {
	id: string;
	name: string;
	prompt: string;
	/** Expected answer elements for validation */
	expectedContains: string[];
	/** MCP tool that should be used (for WITH MCP scenario) */
	expectedTool: string;
	/** Maximum turns allowed for WITH MCP scenario. Benchmark fails if exceeded. */
	maxTurns: number;
}

export interface BenchmarkScenario {
	id: string;
	name: string;
	/** CLI flags to pass to claude */
	cliFlags: string[];
	/** Description for reports */
	description: string;
}

export interface BenchmarkRun {
	promptId: string;
	scenarioId: string;
	iteration: number;
	timestamp: string;
	durationMs: number;
	durationApiMs: number;
	costUsd: number;
	numTurns: number;
	inputTokens: number;
	outputTokens: number;
	cacheCreationTokens: number;
	cacheReadTokens: number;
	success: boolean;
	answerValid: boolean;
	/** True if numTurns exceeded maxTurns limit (WITH MCP scenario only) */
	turnLimitExceeded: boolean;
	result: string;
}

export interface BenchmarkSummary {
	promptId: string;
	promptName: string;
	scenarioId: string;
	scenarioName: string;
	runs: number;
	avgDurationMs: number;
	avgCostUsd: number;
	avgTurns: number;
	avgInputTokens: number;
	avgOutputTokens: number;
	successRate: number;
	validationRate: number;
}

export interface BenchmarkReport {
	timestamp: string;
	projectName: string;
	iterations: number;
	runs: BenchmarkRun[];
	summaries: BenchmarkSummary[];
}
