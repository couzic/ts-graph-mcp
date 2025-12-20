# Benchmark Library

Shared utilities for running benchmarks across ts-graph-mcp test projects.

## Quick Start

```bash
# From project root
npm run benchmark:setup    # Pre-index test project (run once)
npm run benchmark          # Default: 1 run, 3 concurrent
npm run benchmark:full     # 3 runs per prompt/scenario
npm run benchmark:quick    # Skip setup, just run (if already indexed)

# CLI options
npm run benchmark -- --runs 5           # 5 runs per prompt/scenario
npm run benchmark -- --concurrency 5    # 5 concurrent
npm run benchmark -- --sequential       # One at a time
npm run benchmark -- --prompt P1        # Run specific prompt
npm run benchmark -- --scenario with-mcp
```

## Adding Benchmarks to a New Test Project

**You only need ONE file: `benchmark/prompts.ts`**

```typescript
// sample-projects/my-project/benchmark/prompts.ts
import type { BenchmarkConfig, BenchmarkPrompt } from "../../../benchmark/lib/types.js";

export const config: BenchmarkConfig = {
  projectName: "my-project",
  projectRoot: import.meta.dirname + "/..",
  tsconfig: "tsconfig.json",
};

export const prompts: BenchmarkPrompt[] = [
  {
    id: "P1",
    name: "Test prompt",
    prompt: "What does function X do?",
    expectedContains: ["expected", "answer", "keywords"],
    expectedTool: "outgoingCallsDeep",  // Which MCP tool should be used
  },
];
```

Then run:

```bash
# Setup (index the project)
npx tsx benchmark/lib/setup.ts sample-projects/my-project

# Run benchmarks
npx tsx benchmark/lib/run.ts sample-projects/my-project
```

## Configuration Options

The `BenchmarkConfig` interface:

| Field | Required | Default | Description |
|-------|----------|---------|-------------|
| `projectName` | Yes | - | Unique name (used in results directory) |
| `projectRoot` | Yes | - | Absolute path to test project |
| `tsconfig` | Yes | - | Relative path to tsconfig.json |
| `moduleName` | No | `projectName` | Module name for indexing |
| `packageName` | No | `"main"` | Package name for indexing |
| `dbPath` | No | `".ts-graph/graph.db"` | Database path |

## Architecture

```
benchmark/
├── lib/
│   ├── index.ts       # Re-exports all modules
│   ├── types.ts       # BenchmarkConfig, BenchmarkPrompt, BenchmarkRun, etc.
│   ├── scenarios.ts   # WITH/WITHOUT MCP configurations
│   ├── report.ts      # Report generation and markdown formatting
│   ├── runner.ts      # Claude CLI subprocess handling
│   ├── setup.ts       # Shared setup script (indexes a test project)
│   └── run.ts         # Shared runner script (runs benchmarks)
└── results/           # All benchmark results
    └── <project>/     # Results organized by project name

sample-projects/
└── <project>/
    ├── .mcp.json              # MCP server configuration
    ├── tsconfig.json
    ├── src/                   # Source files to index
    └── benchmark/
        └── prompts.ts         # THE ONLY FILE YOU NEED TO CREATE
```

## Modules

### `types.ts`
TypeScript interfaces for benchmark data structures:
- `BenchmarkConfig` - Test project configuration
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

### `setup.ts`
Shared setup script:
- `setupBenchmark(config)` - Index a test project
- CLI: `npx tsx benchmark/lib/setup.ts <project-path>`

### `run.ts`
Shared runner script:
- `runBenchmarks(config, prompts, options)` - Run benchmarks
- CLI: `npx tsx benchmark/lib/run.ts <project-path> [options]`
