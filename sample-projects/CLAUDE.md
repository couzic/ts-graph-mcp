# Sample Projects

Sample TypeScript codebases for E2E testing and benchmarking.

## Purpose

Sample projects exist for **two purposes only**:

1. **E2E Tests** — Test actual MCP tool query functions against real, indexed codebases
2. **Benchmarks** — Measure Claude Code agent performance with vs without MCP tools

**Sample projects are NOT for:**
- Testing AST extraction (covered by unit tests in `src/ingestion/`)
- Testing node/edge extraction (covered by unit tests in `src/ingestion/`)
- Testing generic DB queries (covered by unit tests in `src/db/`)

## Current Projects

### `deep-chain/`
10-file cross-file call chain (`entry` → `step02` → ... → `step10`).

**E2E tests for:** `queryCallees`, `queryCallers`, `queryPath`
- Extreme depth traversal (10 hops)
- Depth limiting behavior
- Cycle detection (linear chain has no cycles)

**Status:** ✅ Correctly tests tool query functions

### `layered-api/`
5-layer architecture (routes → controllers → services → repositories → db).

**E2E tests for:** `queryCallees`, `queryCallers`, `queryPath`
- Layer boundary verification
- Multi-hop path finding
- Depth limiting at layer boundaries

**Benchmarks:** `findPaths`, `outgoingCallsDeep`

**Status:** ✅ Correctly tests tool query functions

### `mixed-types/`
All 8 node types: Function, Class, Method, Interface, TypeAlias, Variable, Property, File.

**E2E tests for:** `queryImpactedNodes`, `queryCallers`, `queryCallees`, `queryPath`
- Impact analysis across type references
- 3-level class hierarchy traversal (AdminService → UserService → BaseService)
- Cross-file type usage impact
- Depth limiting behavior

**Status:** ✅ Correctly tests tool query functions

### `web-app/`
3 packages in single module (flat packages format).

**E2E tests for:** `queryImpactedNodes`, `queryCallers`, `queryCallees`, `queryPath`, `queryPackageDeps`, `queryIncomingPackageDeps`
- Cross-package impact analysis
- Package dependency traversal
- Path finding between packages

**Status:** ✅ Correctly tests tool query functions

### `monorepo/`
3 modules × 2 packages = 6 packages (true L3 structure).

**E2E tests for:** `queryPackageDeps`, `queryIncomingPackageDeps`, `queryImpactedNodes`, `queryPath`, `queryCallers`, `queryCallees`
- Cross-module path finding
- Cross-module impact analysis
- Package dependency traversal (both directions)
- Depth limiting behavior

**Benchmarks:** `analyzeImpact`, `incomingCallsDeep`, package dependency tools

**Status:** ✅ Correctly tests tool query functions

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

## E2E Test Rules

### What E2E Tests Must Do

E2E tests call **actual tool query functions** from `src/tools/*/query.ts`:

```typescript
// ✅ CORRECT — Testing actual MCP tool query logic
import { queryCallers } from "../../src/tools/incoming-calls-deep/query.js";
import { queryCallees } from "../../src/tools/outgoing-calls-deep/query.js";
import { queryPath } from "../../src/tools/find-paths/query.js";
import { queryImpactedNodes } from "../../src/tools/analyze-impact/query.js";
import { queryIncomingPackageDeps } from "../../src/tools/incoming-package-deps/query.js";
import { queryPackageDeps } from "../../src/tools/outgoing-package-deps/query.js";

// ❌ WRONG — Testing generic DB layer (already covered in src/)
import { queryNodes } from "../../src/db/queryNodes.js";  // NO!
import { queryEdges } from "../../src/db/queryEdges.js";  // NO!
```

### Allowed APIs

**Setup only** (import from `src/`, never `dist/`):
- `openDatabase()`, `initializeSchema()`, `createSqliteWriter()` — DB setup
- `indexProject()` — Index the sample project
- `queryNodes()` — **Only** for test setup (finding node IDs to pass to tool queries)

**Test assertions** (the actual E2E tests):
- `queryCallers(db, nodeId, options)` — From `src/tools/incoming-calls-deep/query.js`
- `queryCallees(db, nodeId, maxDepth)` — From `src/tools/outgoing-calls-deep/query.js`
- `queryPath(db, sourceId, targetId)` — From `src/tools/find-paths/query.js`
- `queryImpactedNodes(db, nodeId, options)` — From `src/tools/analyze-impact/query.js`
- `queryIncomingPackageDeps(db, params)` — From `src/tools/incoming-package-deps/query.js`
- `queryPackageDeps(db, module, pkg, maxDepth)` — From `src/tools/outgoing-package-deps/query.js`

### Forbidden in E2E Tests

- `queryEdges()` — Generic DB query, not tool logic
- `queryNodes()` as the primary assertion — Use it only to find IDs for tool queries
- `db.prepare()`, `db.exec()` — Raw SQL
- Testing node/edge extraction — Already covered in `src/`

### Example: Correct E2E Test

```typescript
describe("incomingCallsDeep E2E", () => {
  it("finds transitive callers across modules", () => {
    // Setup: find the target node ID
    const [targetNode] = queryNodes(db, "createUser", { module: "shared" });

    // E2E test: call actual tool query function
    const callers = queryCallers(db, targetNode.id, { maxDepth: 5 });

    // Assert tool behavior
    expect(callers.some(c => c.module === "backend")).toBe(true);
    expect(callers.some(c => c.module === "frontend")).toBe(true);
  });
});
```

## Adding Test Projects

Each test project needs:
- `tsconfig.json` — TypeScript configuration
- `src/` — Source files to index
- `e2e.test.ts` — E2E tests calling actual tool query functions (NOT `integration.test.ts`)

Test pattern:
```typescript
beforeAll(async () => {
  db = openDatabase({ path: ":memory:" });
  initializeSchema(db);
  const writer = createSqliteWriter(db);
  await indexProject(config, writer, { projectRoot: join(import.meta.dirname) });
});

describe("incomingCallsDeep E2E", () => {
  it("finds callers with depth limiting", () => {
    const [target] = queryNodes(db, "targetFunction");
    const callers = queryCallers(db, target.id, { maxDepth: 3 });
    expect(callers.length).toBeGreaterThan(0);
  });
});
```

## Testing Strategy

**E2E tests** and **benchmarks** serve different purposes:

| Aspect | E2E Tests | Benchmarks |
|--------|-----------|------------|
| **Purpose** | Verify MCP tool **query logic** works | Measure Claude Code **agent performance** |
| **What they test** | Tool query functions from `src/tools/*/query.ts` | Claude's ability to use MCP tools |
| **Cost** | Free (in-memory SQLite) | $2-5 per run (real Claude API) |
| **When to add** | Every tool needs E2E coverage | Only representative query types |

**E2E test coverage goals:**
- Each MCP tool should have E2E tests in at least one sample project
- Tests should exercise tool-specific logic (depth limiting, cycle detection, etc.)
- Tests should NOT duplicate unit tests from `src/`

**Current E2E coverage:**

| Tool | Covered By | Status |
|------|-----------|--------|
| `incomingCallsDeep` | deep-chain, layered-api, mixed-types, monorepo | ✅ |
| `outgoingCallsDeep` | deep-chain, layered-api, mixed-types, web-app, monorepo | ✅ |
| `findPaths` | deep-chain, layered-api, mixed-types, web-app, monorepo | ✅ |
| `analyzeImpact` | mixed-types, web-app, monorepo | ✅ |
| `incomingPackageDeps` | web-app, monorepo | ✅ |
| `outgoingPackageDeps` | web-app, monorepo | ✅ |

**Benchmark coverage:**
- `layered-api` — path finding, deep call traversal
- `monorepo` — cross-module analysis, package dependencies

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
| `layered-api` | P1-P3 | `outgoingCallsDeep`, `findPaths` (+ negative test) |
| `monorepo` | P1-P5 | `analyzeImpact`, `incomingCallsDeep`, `outgoingPackageDeps`, `incomingPackageDeps`, `findPaths` |

### Sample Results (monorepo)

| Metric | WITH MCP | WITHOUT MCP | Improvement |
|--------|----------|-------------|-------------|
| Duration | 9-13s | 18-42s | **2-4x faster** |
| Turns | 2 | 3-10 | **2-5x fewer** |
| Cost | $0.22 | $0.30-$0.84 | **30-75% cheaper** |

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
