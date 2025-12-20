# Sample Projects

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
- Note: This is a simplified L2 structure. See `monorepo/` for the full L3 test.

### `monorepo/`
True L3 monorepo structure with 3 modules × 2 packages each = 6 packages.
- Tests cross-package edges within same module (backend/api → backend/services)
- Tests cross-module edges between packages (backend/services → shared/utils)
- Tests module + package filtering with `search_nodes`
- Tests `get_impact` analysis at package granularity
- 30 integration tests

## Planned Projects

See **PLANNED.md** for the full roadmap of test projects to be created, including:
- `shared-utils` - Wide fan-in pattern, `get_impact` testing
- `type-system` - EXTENDS, IMPLEMENTS, USES_TYPE edges
- `multi-package` - L2 multi-package structure

## Documentation Strategy

| Document | Purpose | Content |
|----------|---------|---------|
| `CLAUDE.md` | Current state & quick reference | What exists now, how to use it |
| `PLANNED.md` | Future work only | Roadmap of planned projects, coverage gaps |

**When completing a project:**
1. Add it to "Current Projects" in `CLAUDE.md`
2. Remove it from `PLANNED.md` (delete the section entirely)
3. Update coverage matrix in `PLANNED.md` to show existing vs planned

## Integration Test Rules

Tests MUST be database-agnostic to support multiple backends (SQLite, Neo4j, Memgraph).

**Allowed APIs** (always import from `src/`, never `dist/`):
- `openDatabase()`, `initializeSchema()`, `createSqliteWriter()` - Setup only
- `querySearchNodes()` - From `../../src/tools/search-nodes/query.js`
- `queryCallers()`, `queryCallees()` - From respective tool query.js files
- `queryEdges()` - From `../../src/db/queryEdges.js`
- `queryImpactedNodes()` - From `../../src/tools/get-impact/query.js`
- `DbWriter.addNodes()`, `DbWriter.addEdges()` - For writes

**Forbidden in tests:**
- `db.prepare()` - Raw SQL
- `db.exec()` - Raw SQL
- `.all()`, `.get()`, `.run()` on prepared statements
- Any SQLite-specific syntax (GLOB, LIKE, recursive CTEs)

**Pattern conversion** (SQL → query functions):
- `LIKE '%foo%'` → `sourcePattern: "*foo*"` (glob)
- `LIKE '%foo'` → `targetPattern: "*foo"` (glob)
- Exact match → `sourceId: "exact/path:symbol"`

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

## Testing Strategy

**Integration tests** and **benchmarks** serve different purposes:

| Aspect | Integration Tests | Benchmarks |
|--------|------------------|------------|
| **Purpose** | Verify MCP tool **correctness** | Measure Claude Code **agent performance** |
| **Question answered** | "Does the code work for this structure?" | "Does MCP help Claude with this query type?" |
| **Coverage approach** | Every unique structure needs tests | Only representative query types needed |
| **Cost** | Free (in-memory SQLite) | $2-5 per run (real Claude API) |

**Why not all projects need benchmarks:**
- Integration tests guard against regressions in extraction/query code
- Benchmarks prove MCP's value proposition (cost savings, fewer turns)
- Once value is proven for a query type (e.g., deep traversal), re-proving with structural variants adds no signal

**Current strategy:**
- `deep-chain` benchmarks prove value for **deep transitive traversal**
- `monorepo` benchmarks prove value for **cross-module/package analysis**
- `mixed-types` and `web-app` have full integration test coverage but no benchmarks (their query patterns are already covered)

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
sample-project/
├── .mcp.json              # Points to ts-graph-mcp server
├── .ts-graph/graph.db     # Pre-indexed database (created by setup)
├── tsconfig.json
├── src/
└── benchmark/
    └── prompts.ts         # THE ONLY FILE YOU NEED TO CREATE
```

### Current Benchmarks

| Project | Prompts | Query Types Covered |
|---------|---------|---------------------|
| `deep-chain` | P1, P2, P3 | Deep transitive traversal (`get_callees`, `find_path`, `get_impact`) |
| `monorepo` | P1, P2, P3, P4 | Cross-module/package analysis (`get_callers`, `get_impact`, `get_neighbors`) |

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
   npx tsx benchmark/lib/setup.ts sample-projects/my-project
   ```

4. **Run benchmarks**:
   ```bash
   npx tsx benchmark/lib/run.ts sample-projects/my-project
   ```

### Why MCP Wins

**deep-chain example:**
- WITHOUT MCP: Claude reads 10 files sequentially to trace call chain
- WITH MCP: Single `get_callees(entry, maxDepth: 10)` → instant answer

**web-app example:**
- WITHOUT MCP: Claude traces imports across modules, reads multiple files
- WITH MCP: `get_impact(sharedType)` shows cross-module dependents instantly

**monorepo example:**
- WITHOUT MCP: Claude must navigate 6 packages across 3 modules to trace dependencies
- WITH MCP: `get_callers(createUserService)` instantly finds backend/api callers, `get_impact(User)` shows all 6 packages affected
