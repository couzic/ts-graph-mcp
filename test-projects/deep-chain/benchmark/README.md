# Benchmark: deep-chain

Measures Claude Code performance **with vs without MCP tools** on call chain analysis.

## Quick Start

```bash
# From project root

# 1. First time: Setup (pre-index the project)
npm run benchmark:setup

# 2. Run benchmarks
npm run benchmark:quick   # Single iteration (fast check)
npm run benchmark         # Full run (3 iterations each)
```

## Setup

The benchmark requires a pre-indexed database so the MCP server has data ready.
Run `npm run benchmark:setup` once before benchmarking (or after changing source files).

## What It Tests

| Prompt | Description | Expected MCP Tool |
|--------|-------------|-------------------|
| P1 | Transitive callees of `entry` | `get_callees` |
| P2 | Call path from `entry` to `step10` | `find_path` |
| P3 | Impact of changing `step10` | `get_impact` |

## Scenarios

- **WITH MCP**: Claude uses ts-graph-mcp tools for graph queries
- **WITHOUT MCP**: Claude reads files manually to trace relationships

## CLI Options

```bash
npx tsx benchmark/run.ts                    # Default (3 iterations)
npx tsx benchmark/run.ts --quick            # Single iteration
npx tsx benchmark/run.ts --iterations 5     # 5 iterations
npx tsx benchmark/run.ts --prompt P1        # Only run P1
npx tsx benchmark/run.ts --scenario with-mcp # Only WITH MCP
npx tsx benchmark/run.ts --verbose          # Show detailed output
```

## Output

Results are saved to the **project root**: `benchmark/results/deep-chain/`
- `run-{timestamp}.json` - Raw benchmark data
- Console shows summary with comparison

## Expected Results

MCP tools should provide:
- **Faster resolution** - Single tool call vs multiple file reads
- **Lower cost** - Fewer tokens consumed
- **Same accuracy** - Both should find correct answers

## Verified Results (2024-12-16)

| Metric | WITH MCP | WITHOUT MCP | Improvement |
|--------|----------|-------------|-------------|
| Duration | 7s | 20-22s | **3x faster** |
| Turns | 2 | 13 | **6.5x fewer** |
| Cost | $0.06 | $0.11-$0.15 | **~2x cheaper** |

## File Structure

```
benchmark/
├── README.md           # This file
├── setup.ts            # Pre-indexes deep-chain into SQLite
├── run.ts              # Main benchmark runner
├── prompts.ts          # P1, P2, P3 prompt definitions
```

Shared utilities are imported from `<project-root>/benchmark/lib/`.

## Adding to Other Test Projects

See `test-projects/CLAUDE.md` for instructions on adding benchmarks to other projects.
