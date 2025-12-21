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
- Primary benchmark for `outgoingCallsDeep`, `incomingCallsDeep`, `findPath` at depth
- 20 integration tests

### `mixed-types/`
All 8 node types: Function, Class, Method, Interface, TypeAlias, Variable, Property, File.
- Tests node extraction completeness and type-specific properties
- **Benchmark for type usage tools**: `incomingUsesType`
- 3-level class hierarchy (`AdminService → UserService → BaseService`) for edge extraction testing
- 28 integration tests

### `web-app/`
Web app using **flat packages format** (3 packages in single "main" module).
- Uses simplified config: `packages: [...]` instead of nested `modules: [{ packages: [...] }]`
- Tests cross-PACKAGE edges (CALLS, USES_TYPE, IMPORTS) within single module
- Tests package filtering with `queryNodes`
- Tests `analyzeImpact` analysis across packages
- **Example of flat config format** (Issue #15). 15 integration tests.
- For cross-MODULE edge testing, see `monorepo/`.

### `monorepo/`
True L3 monorepo structure with 3 modules × 2 packages each = 6 packages.
- **Primary test for cross-MODULE edges** (backend/services → shared/utils)
- Tests cross-package edges within same module (backend/api → backend/services)
- Tests module + package filtering with `queryNodes`
- Tests `analyzeImpact` analysis at module and package granularity
- 30 integration tests

## Planned Projects

See **PLANNED.md** for the full roadmap of test projects to be created, including:
- `shared-utils` - Wide fan-in pattern, `analyzeImpact` testing
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
- `queryNodes()` - From `src/db/queryNodes.js`
- `queryCallers()`, `queryCallees()` - From `src/tools/incoming-calls-deep/query.js` and `src/tools/outgoing-calls-deep/query.js`
- `queryEdges()` - From `src/db/queryEdges.js`
- `queryImpactedNodes()` - From `src/tools/analyze-impact/query.js`
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
- `monorepo` benchmarks prove value for **cross-module/package analysis** and **package dependencies**
- `mixed-types` benchmarks prove value for **type usage tracking** (`incomingUsesType`)
- `web-app` has full integration test coverage but no benchmarks (query patterns already covered by other projects)

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
├── .mcp-enabled.json      # MCP server config (for WITH MCP scenario)
├── .mcp-disabled.json     # Empty config (for WITHOUT MCP scenario)
├── .ts-graph/graph.db     # Pre-indexed database (created by setup)
├── tsconfig.json
├── src/
└── benchmark/
    └── prompts.ts         # THE ONLY FILE YOU NEED TO CREATE
```

### Current Benchmarks

| Project | Prompts | Tools Covered |
|---------|---------|---------------|
| `deep-chain` | P1-P3 | `outgoingCallsDeep`, `findPath`, `analyzeImpact` |
| `monorepo` | P1-P6 | `incomingCallsDeep`, `analyzeImpact`, `outgoingImports`, `outgoingPackageDeps`, `incomingPackageDeps` |
| `mixed-types` | P1 | `incomingUsesType` |

### Sample Results (deep-chain)

| Metric | WITH MCP | WITHOUT MCP | Improvement |
|--------|----------|-------------|-------------|
| Duration | 7s | 20-22s | **3x faster** |
| Turns | 2 | 13 | **6.5x fewer** |
| Cost | $0.06 | $0.11-$0.15 | **~2x cheaper** |

### Adding Benchmarks to a Test Project

1. **Create MCP config files** in the test project root:

   `.mcp-enabled.json` (for WITH MCP scenario):
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

   `.mcp-disabled.json` (for WITHOUT MCP scenario):
   ```json
   {
     "mcpServers": {}
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
       expectedTool: "outgoingCallsDeep",
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
- WITH MCP: Single `outgoingCallsDeep(entry, maxDepth: 10)` → instant answer

**web-app example:**
- WITHOUT MCP: Claude traces imports across modules, reads multiple files
- WITH MCP: `analyzeImpact(sharedType)` shows cross-module dependents instantly

**monorepo example:**
- WITHOUT MCP: Claude must navigate 6 packages across 3 modules to trace dependencies
- WITH MCP: `incomingCallsDeep(createUserService)` instantly finds backend/api callers, `analyzeImpact(User)` shows all 6 packages affected
