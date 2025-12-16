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

### `cross-file-calls/`
Cross-file function calls with multiple scenarios:
- Direct cross-file calls (`caller` → `helper`)
- Multiple callers to same target
- Call count tracking (`multiCaller` calls `helper` twice)
- Transitive chains across 3 files (`chain` → `intermediate` → `helper`)

**Regression test for Issue #9** (cross-file CALLS edges not extracted). 14 integration tests.

### `mixed-types/`
All 8 node types: Function, Class, Method, Interface, TypeAlias, Variable, Property, File.
- Tests node extraction completeness and type-specific properties
- Will be merged into `type-system` when that project is implemented (see PLANNED.md)
- 23 integration tests

## Planned Projects

See **PLANNED.md** for the full roadmap of test projects to be created, including:
- `type-system` - EXTENDS, IMPLEMENTS, USES_TYPE edges
- `shared-utils` - Wide fan-in pattern, `get_impact` testing
- `multi-package` - L2 multi-package structure
- `monorepo` - L3 multi-module (regression test for Issue #5)

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
│   ├── index.ts       # Re-exports
│   ├── types.ts       # Shared interfaces
│   ├── scenarios.ts   # WITH/WITHOUT MCP configs
│   ├── report.ts      # Report generator
│   └── runner.ts      # Claude CLI subprocess handling
└── results/           # All benchmark results
    └── <project>/     # Results organized by project name
```

**Each test project** needs:
```
test-project/
├── .mcp.json              # Points to ts-graph-mcp server
├── .ts-graph/graph.db     # Pre-indexed database (created by setup)
├── tsconfig.json
├── src/
└── benchmark/
    ├── setup.ts           # Pre-indexes the project
    ├── run.ts             # Main runner (imports from root benchmark/)
    └── prompts.ts         # Project-specific prompts
```

### Current Benchmarks

| Project | Status | Prompts | Primary Tools Tested |
|---------|--------|---------|---------------------|
| `deep-chain` | ✅ Ready | P1, P2, P3 | `get_callees`, `find_path`, `get_impact` |
| `cross-file-calls` | 🔜 Planned | - | `get_callers`, call_count |
| `mixed-types` | 🔜 Planned | - | `search_nodes`, type filters |

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

2. **Copy benchmark files** from `deep-chain/benchmark/` (setup.ts, run.ts, prompts.ts)

3. **Customize `prompts.ts`** with project-specific questions

4. **Run setup** to pre-index: `npx tsx benchmark/setup.ts`

5. **Run benchmarks**: `npx tsx benchmark/run.ts`

### Why MCP Wins

**deep-chain example:**
- WITHOUT MCP: Claude reads 10 files sequentially to trace call chain
- WITH MCP: Single `get_callees(entry, maxDepth: 10)` → instant answer

**cross-file-calls example:**
- WITHOUT MCP: Claude greps for function calls, reads files, counts manually
- WITH MCP: `get_callers(helper)` returns all callers with call counts
