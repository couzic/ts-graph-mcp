/**
 * Shared types for benchmark results.
 * Used by all test project benchmarks.
 */

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
