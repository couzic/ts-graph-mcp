# Benchmark Module

Measures MCP tool effectiveness by comparing Claude Code performance WITH vs WITHOUT ts-graph tools.

## Quick Start

```bash
npm run benchmark:monorepo
```

The HTTP server starts automatically, indexes the project, and runs benchmarks once ready.

## Key Concepts

**Two Scenarios:**
- `with-mcp` - ts-graph tools available (always runs)
- `without-mcp` - No MCP tools, only standard Claude Code tools (skipped if 5+ runs in history)

**History System:**
- Results stored in `results/<project>/history.json`
- Key = prompt text (plain string, not hash)
- WITHOUT_MCP runs are expensive → reused after 5 runs
- WITH_MCP always runs for fresh measurements

## CLI Flags

| Flag | Purpose |
|------|---------|
| `--runs <n>` | Iterations per prompt/scenario (default: 1) |
| `--prompt <id>` | Run specific prompt only (e.g., P1) |
| `--scenario <id>` | Run specific scenario (with-mcp or without-mcp) |
| `--force-all` | Ignore history, run all scenarios |
| `--min-runs <n>` | WITHOUT_MCP threshold before skipping (default: 5) |

## File Structure

```
benchmark/
├── lib/                         # Shared benchmark library
│   ├── run.ts                   # Main orchestrator (CLI entry)
│   ├── runner.ts                # Claude CLI execution, HTTP server management
│   ├── history.ts               # History file I/O
│   ├── runDecision.ts           # Skip logic for WITHOUT_MCP
│   ├── historicalComparison.ts  # Compare vs historical averages
│   ├── report.ts                # Report generation
│   ├── scenarios.ts             # WITH/WITHOUT MCP configs
│   └── types.ts                 # Type definitions
└── results/                     # Output directory
    └── <project>/
        ├── history.json         # Persistent run history
        └── run-*.json           # Individual run snapshots
```

## Adding a Test Project

Create `<project>/benchmark/prompts.ts`:

```typescript
import type { BenchmarkConfig, BenchmarkPrompt } from "../../benchmark/lib/index.js";

export const config: BenchmarkConfig = {
  projectName: "my-project",
  projectRoot: import.meta.dirname + "/..",
};

export const prompts: BenchmarkPrompt[] = [
  {
    id: "P1",
    name: "Find callers",
    prompt: "What functions call handleRequest?",
    expectedContains: ["processData", "validateInput"],
    expectedTool: "incomingCallsDeep",
    expectedTurns: 3,
  },
];
```

## Prompt Guidelines

See `benchmark-prompt-guidelines.md` for writing effective benchmark prompts:
- Lead with motivation ("I'm refactoring...")
- Use natural language ("all the way down" not "transitively")
- Fuzzy symbol references ("the User interface" not full paths)
- Ask questions, not commands
