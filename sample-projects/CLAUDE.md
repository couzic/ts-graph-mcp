# Sample Projects

Sample TypeScript codebases for E2E testing and benchmarking.

## Purpose

Sample projects exist for **two purposes only**:

1. **E2E Tests** — Test actual MCP tool query functions against real, indexed codebases
2. **Benchmarks** — Measure Claude Code agent performance with vs without MCP tools

**Sample projects are NOT for:**
- Testing AST extraction (covered by unit tests in `http/src/ingestion/`)
- Testing node/edge extraction (covered by unit tests in `http/src/ingestion/`)
- Testing generic DB queries

## Documentation Strategy

| Document | Purpose | Content |
|----------|---------|---------|
| `CLAUDE.md` | Current state & quick reference | What exists now, how to use it |
| `PLANNED.md` | Future work only | Roadmap of planned projects, coverage gaps |

**When completing a project:**
1. Add it to "Current Projects" in `CLAUDE.md`
2. Remove it from `PLANNED.md` (delete the section entirely)
3. Update coverage matrix in `PLANNED.md` to show existing vs planned

## E2E Test Rules

### What E2E Tests Must Do

E2E tests call **internal query functions** from `http/src/query/*/`. These are the same functions that the MCP `searchGraph` tool uses internally:

```typescript
// ✅ CORRECT — Testing internal query functions (used by searchGraph)
import { dependenciesOf } from "../../http/src/query/dependencies-of/dependenciesOf.js";
import { dependentsOf } from "../../http/src/query/dependents-of/dependentsOf.js";
import { pathsBetween } from "../../http/src/query/paths-between/pathsBetween.js";

// ❌ WRONG — Testing generic DB layer (already covered in http/src/)
import { queryNodes } from "../../http/src/db/queryNodes.js";  // NO!
import { queryEdges } from "../../http/src/db/queryEdges.js";  // NO!
```

### Allowed APIs

**Setup only** (import from `src/`, never `dist/`):
- `openDatabase()`, `initializeSchema()`, `createSqliteWriter()` — DB setup
- `indexProject()` — Index the sample project

**Test assertions** (internal query functions):
- `dependenciesOf(db, projectRoot, filePath, symbol)` — Forward traversal
- `dependentsOf(db, projectRoot, filePath, symbol)` — Backward traversal
- `pathsBetween(db, projectRoot, from, to)` — Path finding

### Forbidden in E2E Tests

- `queryEdges()` — Generic DB query, not tool logic
- `db.prepare()`, `db.exec()` — Raw SQL
- Testing node/edge extraction — Already covered in `src/`

### Golden Master Testing

E2E tests use **golden master assertions** — exact `.toBe()` matching against the complete tool output:

```typescript
it("finds all callees of entry", () => {
  const output = dependenciesOf(db, projectRoot, "src/entry.ts", "entry");

  // Golden master: exact output match
  expect(output).toBe(`## Graph

entry --CALLS--> step02 --CALLS--> step03

## Nodes

step02:
  file: src/handlers/step02.ts
  offset: 3, limit: 3
  snippet:
    3: export function step02(): string {
    4: \treturn step03() + "-02";
    5: }
`);
});
```

**Why golden master?**
- Catches unintended output changes (formatting, ordering, content)
- Documents exact expected behavior
- No partial matches that might miss regressions

**Updating golden masters:**
1. Run test to see actual output
2. Verify output is correct
3. Copy exact output into test assertion

## Adding Test Projects

Each test project needs:
- `tsconfig.json` — TypeScript configuration
- `src/` — Source files to index
- `e2e.test.ts` — E2E tests calling actual tool functions

Test pattern:
```typescript
beforeAll(async () => {
  db = openDatabase({ path: ":memory:" });
  initializeSchema(db);
  const writer = createSqliteWriter(db);
  await indexProject(config, writer, { projectRoot: join(import.meta.dirname) });
});

describe("dependenciesOf E2E", () => {
  it("finds forward dependencies", () => {
    const output = dependenciesOf(db, projectRoot, "src/entry.ts", "entry");

    // Golden master assertion - exact match
    expect(output).toBe(`## Graph

entry --CALLS--> step02

## Nodes

step02:
  file: src/step02.ts
  ...
`);
  });
});
```

## Testing Strategy

**E2E tests** and **benchmarks** serve different purposes:

| Aspect | E2E Tests | Benchmarks |
|--------|-----------|------------|
| **Purpose** | Verify MCP tool **logic** works | Measure Claude Code **agent performance** |
| **What they test** | Tool functions from `http/src/query/*/` | Claude's ability to use MCP tools |
| **Cost** | Free (in-memory SQLite) | $2-5 per run (real Claude API) |
| **When to add** | Every tool needs E2E coverage | Only representative query types |

**E2E test coverage goals:**
- Each MCP tool should have E2E tests in at least one sample project
- Tests should exercise tool-specific logic (graph traversal, path finding, etc.)
- Tests should NOT duplicate unit tests from `src/`

**Current E2E coverage:**

| Query Type | Internal Function | Covered By | Status |
|------------|-------------------|-----------|--------|
| Forward traversal | `dependenciesOf` | call-chain | ✅ |
| Backward traversal | `dependentsOf` | call-chain | ✅ |
| Path finding | `pathsBetween` | call-chain | ✅ |

**Benchmark coverage:**
- `call-chain` — forward deps, reverse deps, path finding
- `layered-api` — path finding, deep call traversal
- `monorepo` — cross-package analysis

## Benchmarking

**Goal:** Measure time/accuracy for Claude Code to answer codebase questions with vs without MCP tools.

### Quick Start

```bash
# From project root
npm run benchmark:setup    # Pre-index (run once)
npm run benchmark          # Default: 1 run, 6 concurrent
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
├── .mcp.json              # MCP server config (for WITH MCP scenario)
├── .no-mcp.json           # Empty config (for WITHOUT MCP scenario)
├── .ts-graph-mcp/graph.db     # Pre-indexed database (created by setup)
├── tsconfig.json
├── src/
└── benchmark/
    └── prompts.ts         # THE ONLY FILE YOU NEED TO CREATE
```

### Current Benchmarks

| Project | Prompts | Query Types Covered |
|---------|---------|---------------------|
| `call-chain` | P1-P3 | forward, backward, path finding |
| `layered-api` | P1-P4 | forward, path finding (+ negative test) |
| `monorepo` | P1-P5 | forward, backward, path finding |

### Sample Results (monorepo)

| Metric | WITH MCP | WITHOUT MCP | Improvement |
|--------|----------|-------------|-------------|
| Duration | 9-13s | 18-42s | **2-4x faster** |
| Turns | 2 | 3-10 | **2-5x fewer** |
| Cost | $0.22 | $0.30-$0.84 | **30-75% cheaper** |

### Adding Benchmarks to a Test Project

1. **Create MCP config files** in the test project root:

   `.mcp.json` (for WITH MCP scenario):
   ```json
   {
     "mcpServers": {
       "ts-graph": {
         "command": "node",
         "args": ["../../dist/mcp/main.js"]
       }
     }
   }
   ```

   `.no-mcp.json` (for WITHOUT MCP scenario):
   ```json
   {
     "mcpServers": {}
   }
   ```

2. **Create `benchmark/prompts.ts`** following the [prompt guidelines](benchmark-prompt-guidelines.md):
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
       expectedTool: "searchGraph",
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

**call-chain example:**
- WITHOUT MCP: Claude reads 5 files sequentially to trace call chain
- WITH MCP: Single `searchGraph({ from: { symbol: "entry" } })` → instant answer with full chain

**layered-api example:**
- WITHOUT MCP: Claude traces imports through 5 layers, reads multiple files
- WITH MCP: `searchGraph({ from, to })` shows the exact path through layers instantly

**monorepo example:**
- WITHOUT MCP: Claude must navigate 6 packages to trace dependencies
- WITH MCP: `searchGraph` instantly finds all callers or shows all dependencies

## Tool Output Design

The MCP tool output is designed **for Claude Code consumption**. When considering format changes, ask Claude what works best — it's both the developer and the user of this tool.
