# Test Projects

Sample TypeScript codebases for integration testing and benchmarking.

## Purpose

1. **Integration Testing** - Exercise the full stack (AST parsing → node/edge extraction → DB writes → MCP queries) with predictable, known expectations
2. **Benchmarking** - Compare Claude Code performance with vs without MCP tools on realistic codebase questions
3. **Regression Testing** - Catch regressions for specific fixed bugs (e.g., Issue #9)

## Current Projects

### `deep-chain/`
10-file cross-file call chain (`entry` → `step02` → ... → `step10`). Tests deep transitive traversal.
- 10 files, each with one function calling the next
- Primary benchmark for `get_callees`, `get_callers`, `find_path` at depth
- 20 integration tests

### `mixed-types/`
All 8 node types: Function, Class, Method, Interface, TypeAlias, Variable, Property, File.
- Tests node extraction completeness and type-specific properties
- Will be merged into `type-system` when that project is implemented (see PLANNED.md)
- 23 integration tests

### `web-app/`
Multi-module web app with 3 modules (shared, frontend, backend), 1 package each.
- Tests cross-module edges (CALLS, USES_TYPE, IMPORTS)
- Tests module filtering with `search_nodes`
- Tests `get_impact` analysis across modules
- **Regression test for Issue #5** (cross-module edge resolution). 15 integration tests.
- Note: This is a simplified structure. See PLANNED.md for a full monorepo test.

## Planned Projects

See **PLANNED.md** for the full roadmap of test projects to be created, including:
- `type-system` - EXTENDS, IMPLEMENTS, USES_TYPE edges
- `shared-utils` - Wide fan-in pattern, `get_impact` testing
- `multi-package` - L2 multi-package structure

## Adding Test Projects

Each test project needs:
- `tsconfig.json` - TypeScript configuration
- `src/` - Source files to index
- `integration.test.ts` - Tests that index the project and verify queries

Test pattern:
```typescript
beforeAll(async () => {
  db = openDatabase({ path: ":memory:" });
  initializeSchema(db);
  const writer = createSqliteWriter(db);
  await indexProject(config, writer, { projectRoot: join(import.meta.dirname) });
});
```

## Benchmarking

**Goal:** Measure time/accuracy for Claude Code to answer codebase questions with vs without MCP tools.

### Quick Start

```bash
# From project root
npm run benchmark:setup    # Pre-index deep-chain (run once)
npm run benchmark          # Default: 1 run, 3 concurrent
npm run benchmark:full     # 3 runs per prompt/scenario

# Adjust runs and concurrency
npm run benchmark -- --runs 5           # 5 runs per prompt/scenario
npm run benchmark -- --concurrency 5    # 5 concurrent
npm run benchmark -- --sequential       # One at a time
```

### Claude CLI Configuration

The benchmark runner needs to spawn the `claude` CLI. By default, it uses `npx @anthropic-ai/claude-code` which works but is slower (~500ms startup).

For faster runs, set `CLAUDE_PATH` to your Claude installation:

```bash
# Find your claude path
type claude  # e.g., "claude is aliased to '/home/user/.claude/local/claude'"

# Run with explicit path (faster)
CLAUDE_PATH=/home/user/.claude/local/claude npm run benchmark:quick
```

Or add to your shell profile:
```bash
export CLAUDE_PATH=/home/user/.claude/local/claude
```

### How It Works

1. **Setup** pre-indexes the test project into a SQLite database
2. **Runner** spawns Claude CLI as subprocess with controlled tool access
3. **Scenarios** compare WITH MCP tools vs WITHOUT (file reading only)
4. **Metrics** captured: duration, cost, turns, token usage, answer validation

### Benchmark Infrastructure

**Shared library** at project root (`benchmark/lib/`):
```
benchmark/
├── lib/
│   ├── index.ts       # Re-exports all modules
│   ├── types.ts       # BenchmarkConfig, BenchmarkPrompt, etc.
│   ├── scenarios.ts   # WITH/WITHOUT MCP configs
│   ├── report.ts      # Report generator
│   ├── runner.ts      # Claude CLI subprocess handling
│   ├── setup.ts       # Shared setup script
│   └── run.ts         # Shared runner script
└── results/           # All benchmark results
    └── <project>/     # Results organized by project name
```

**Each test project only needs ONE file:**
```
test-project/
├── .mcp.json              # Points to ts-graph-mcp server
├── .ts-graph/graph.db     # Pre-indexed database (created by setup)
├── tsconfig.json
├── src/
└── benchmark/
    └── prompts.ts         # THE ONLY FILE YOU NEED TO CREATE
```

### Current Benchmarks

| Project | Status | Prompts | Primary Tools Tested |
|---------|--------|---------|---------------------|
| `deep-chain` | ✅ Ready | P1, P2, P3 | `get_callees`, `find_path`, `get_impact` |
| `mixed-types` | 🔜 Planned | - | `search_nodes`, type filters |
| `web-app` | 🔜 Planned | - | `get_impact`, cross-module edges |

### Sample Results (deep-chain)

| Metric | WITH MCP | WITHOUT MCP | Improvement |
|--------|----------|-------------|-------------|
| Duration | 7s | 20-22s | **3x faster** |
| Turns | 2 | 13 | **6.5x fewer** |
| Cost | $0.06 | $0.11-$0.15 | **~2x cheaper** |

### Adding Benchmarks to a Test Project

1. **Create `.mcp.json`** in the test project root:
   ```json
   {
     "mcpServers": {
       "ts-graph-mcp": {
         "command": "node",
         "args": ["../../dist/mcp/StartServer.js", "--db", ".ts-graph/graph.db"]
       }
     }
   }
   ```

2. **Create `benchmark/prompts.ts`** - this is the only file you need:
   ```typescript
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
       expectedContains: ["expected", "keywords"],
       expectedTool: "get_callees",
     },
   ];
   ```

3. **Run setup** to pre-index:
   ```bash
   npx tsx benchmark/lib/setup.ts test-projects/my-project
   ```

4. **Run benchmarks**:
   ```bash
   npx tsx benchmark/lib/run.ts test-projects/my-project
   ```

### Why MCP Wins

**deep-chain example:**
- WITHOUT MCP: Claude reads 10 files sequentially to trace call chain
- WITH MCP: Single `get_callees(entry, maxDepth: 10)` → instant answer

**web-app example:**
- WITHOUT MCP: Claude traces imports across modules, reads multiple files
- WITH MCP: `get_impact(sharedType)` shows cross-module dependents instantly
