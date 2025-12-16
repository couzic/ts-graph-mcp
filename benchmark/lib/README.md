# Benchmark Library

Shared utilities for running benchmarks across ts-graph-mcp test projects.

## Quick Start

```bash
# From project root
npm run benchmark:setup    # Pre-index test project (run once)
npm run benchmark          # Default: 1 run, 3 concurrent
npm run benchmark:full     # 3 runs per prompt/scenario

# CLI options
npm run benchmark -- --runs 5           # 5 runs per prompt/scenario
npm run benchmark -- --concurrency 5    # 5 concurrent
npm run benchmark -- --sequential       # One at a time
npm run benchmark -- --prompt P1        # Run specific prompt
npm run benchmark -- --scenario with-mcp
```

## Usage

```typescript
// From test-projects/*/benchmark/run.ts:
import {
  scenarios,
  generateReport,
  printComparison,
  runBenchmarkIteration,
  checkDatabase,
  saveResults,
} from "../../../benchmark/lib/index.js";
```

## Modules

### `types.ts`
TypeScript interfaces for benchmark data structures:
- `BenchmarkPrompt` - Prompt definition with expected answers
- `BenchmarkScenario` - WITH/WITHOUT MCP configurations
- `BenchmarkRun` - Single run result
- `BenchmarkReport` - Full report with summaries

### `scenarios.ts`
Pre-defined scenarios for benchmarking:
- `with-mcp` - All ts-graph-mcp tools enabled
- `without-mcp` - MCP tools disabled, file reading only

### `report.ts`
Report generation utilities:
- `generateReport()` - Create report from runs
- `formatReportMarkdown()` - Generate markdown output
- `printComparison()` - Console summary

### `runner.ts`
Benchmark execution utilities:
- `runClaude()` - Spawn Claude CLI subprocess
- `runBenchmarkIteration()` - Run single benchmark
- `validateAnswer()` - Check answer correctness
- `checkDatabase()` - Verify pre-indexed database exists
- `saveResults()` - Save JSON results

## Adding Benchmarks to a Test Project

1. Create `benchmark/prompts.ts` with project-specific prompts
2. Create `benchmark/setup.ts` to pre-index the project
3. Create `benchmark/run.ts` importing from this library
4. See `deep-chain/benchmark/` for a complete example
