# Planned Test Projects

This document tracks test projects to be created for integration testing and benchmarking ts-graph-mcp.

## Goals

1. **Integration Testing** - Verify the full stack works (AST → extraction → DB → queries)
2. **Benchmarking** - Compare Claude Code performance with vs without MCP tools
3. **Regression Testing** - Catch bugs when they're fixed (e.g., Issue #5 cross-module edges)

## Benchmark Strategy

**Not all test projects need benchmarks.** Integration tests and benchmarks serve different purposes:

| Aspect | Integration Tests | Benchmarks |
|--------|------------------|------------|
| **Purpose** | Verify tool correctness | Measure Claude Code agent performance |
| **Coverage** | Every unique structure | Only representative query patterns |
| **Cost** | Free (in-memory SQLite) | $2-5 per run (real Claude API) |

**Benchmark coverage goal:** Prove MCP value for each **distinct query pattern**, not for every structural variant.

### Current Benchmark Coverage

| Query Pattern | Covered By | Status |
|--------------|------------|--------|
| Type hierarchy analysis | `type-system` | 🔜 Planned |

### Projects That Need Benchmarks

| Project | Needs Benchmark? | Reason |
|---------|-----------------|--------|
| `shared-utils` | ❌ No | Covered by `monorepo` P3 (utility usage pattern) |
| `type-system` | ✅ Yes | New pattern: EXTENDS/IMPLEMENTS edges |
| `layered-api` | ✅ Done | Implemented with 3 benchmark prompts |
| `property-access` | ❌ No | Covered by `monorepo` (impact analysis) |
| `event-system` | ❌ No | Covered by `monorepo` (impact analysis) |
| `multi-package` | ❌ No | Covered by `monorepo` (cross-package) |

---

## Existing Projects

| Project | Structure | What It Tests | Status |
|---------|-----------|---------------|--------|
| `mixed-types` | L1: 3 files | All 8 node types | **Merge** into `type-system` when implemented |
| `web-app` | L2: 3 modules, 1 pkg each | Cross-module edges, Issue #5 regression | **Active** - 15 tests |
| `monorepo` | L3: 3 modules, 2 pkg each | Cross-package + cross-module edges | **Active** - 30 tests |
| `layered-api` | L1: 5-layer architecture | Multi-layer paths (routes→controllers→services→repos→db) | **Active** - 19 tests |

### Migration Notes

**`mixed-types` → `type-system`:**
- When implementing `type-system`, include the node type variations from `mixed-types`:
  - Functions: sync/async, with/without return type annotation
  - Variables: const with/without explicit type
- After migration, delete `mixed-types` project
- Keep integration tests that verify all 8 node types are extracted

---

## Planned Projects

### 1. `shared-utils` (Priority: High) 📊

**Purpose:** Test wide fan-in pattern (many callers to few utilities).

**Benchmark:** ✅ Yes — New query pattern (wide fan-in, `searchSymbols` discovery)

**Structure:** L1 - Single package, ~15 files
```
src/
├── utils/
│   ├── formatDate.ts    → used by 8 files
│   ├── validateEmail.ts → used by 6 files
│   └── logger.ts        → used by 10 files
├── features/
│   ├── auth/
│   │   ├── login.ts     → uses logger, validateEmail
│   │   └── signup.ts    → uses logger, validateEmail, formatDate
│   ├── orders/
│   │   ├── create.ts    → uses logger, formatDate
│   │   └── list.ts      → uses logger, formatDate
│   └── ... (more features using utils)
```

**Tests:**
- `incomingCallsDeep(logger)` - returns 10+ callers
- `analyzeImpact(formatDate)` - shows all affected code
- Pattern matching covered by LSP `workspaceSymbol`

**Benchmark Prompts:**
- "What code uses the `logger` function?"
- "If I change `formatDate`, what breaks?"

**Why MCP wins:** `analyzeImpact` instantly shows blast radius vs manually tracing imports.

---

### 2. `type-system` (Priority: High) 📊

**Purpose:** Test type-related edges (EXTENDS, IMPLEMENTS, USES_TYPE).

**Benchmark:** ✅ Yes — New query pattern (type hierarchy traversal)

**Structure:** L1 - Single package, ~10 files
```
src/
├── types/
│   ├── BaseEntity.ts    → interface BaseEntity { id, createdAt }
│   ├── User.ts          → interface User extends BaseEntity
│   └── AdminUser.ts     → interface AdminUser extends User
├── services/
│   ├── EntityService.ts → interface EntityService<T extends BaseEntity>
│   ├── UserService.ts   → class UserService implements EntityService<User>
│   └── AdminService.ts  → class AdminService extends UserService
├── handlers/
│   └── userHandler.ts   → functions using User type in signatures
```

**Tests:**
- EXTENDS edges: `AdminUser → User → BaseEntity`
- IMPLEMENTS edges: `UserService → EntityService`
- USES_TYPE edges: function parameters/returns using types
- `analyzeImpact(BaseEntity)` - shows entire type hierarchy

**Benchmark Prompts:**
- "What types extend `BaseEntity`?"
- "What classes implement `EntityService`?"
- "If I change the `User` interface, what's affected?"

**Why MCP wins:** Type relationships span many files; `analyzeImpact` reveals full dependency tree.

---

### 3. `property-access` (Priority: Medium)

**Purpose:** Test READS_PROPERTY and WRITES_PROPERTY edges.

**Benchmark:** ❌ No — Impact analysis pattern covered by `shared-utils`

**Structure:** L1 - Single package, ~8 files
```
src/
├── models/
│   └── State.ts         → class State { count, users, config }
├── readers/
│   ├── getCount.ts      → reads state.count
│   ├── getUsers.ts      → reads state.users
│   └── getConfig.ts     → reads state.config
├── writers/
│   ├── increment.ts     → writes state.count
│   ├── addUser.ts       → writes state.users
│   └── updateConfig.ts  → writes state.config
└── mixed/
    └── resetCount.ts    → reads then writes state.count
```

**Tests:**
- READS_PROPERTY edges from readers
- WRITES_PROPERTY edges from writers
- `incomingCallsDeep(State.count)` with edge type filtering
- `analyzeImpact(State.count)` - all code touching this property

**Benchmark Prompts:**
- "What code reads `state.count`?"
- "What code modifies `state.users`?"
- "What's the impact of changing the `config` property?"

**Why MCP wins:** Property-level impact analysis without reading every file.

---

### 4. `event-system` (Priority: Medium)

**Purpose:** Test hub patterns and impact analysis tool.

**Benchmark:** ❌ No — Impact analysis pattern covered by `monorepo`

**Structure:** L1 - Single package, ~12 files
```
src/
├── events/
│   └── EventBus.ts      → central hub: emit(), on(), off()
├── emitters/
│   ├── userEvents.ts    → emits USER_CREATED, USER_DELETED
│   ├── orderEvents.ts   → emits ORDER_PLACED, ORDER_SHIPPED
│   └── systemEvents.ts  → emits STARTUP, SHUTDOWN
├── handlers/
│   ├── notifyHandler.ts    → handles USER_CREATED, ORDER_PLACED
│   ├── analyticsHandler.ts → handles all events
│   └── auditHandler.ts     → handles USER_DELETED, ORDER_SHIPPED
└── utils/
    └── eventLogger.ts   → wraps EventBus for logging
```

**Tests:**
- `analyzeImpact(EventBus)` - all code affected by changes to EventBus
- `incomingCallsDeep(EventBus.emit)` - all emitters
- Dense local graph around hub

**Benchmark Prompts:**
- "What's connected to the EventBus?"
- "What handlers process user events?"
- "What happens if I change the EventBus API?"

**Why MCP wins:** `analyzeImpact` instantly reveals all connected code.

---

### 5. `multi-package` (Priority: Medium)

**Purpose:** Test cross-package relationships within a module.

**Benchmark:** ❌ No — Cross-package pattern covered by `monorepo`

**Structure:** L2 - Multi-package (single module)
```
packages/
├── core/
│   ├── tsconfig.json
│   └── src/
│       ├── types.ts     → shared types
│       └── utils.ts     → shared utilities
├── api/
│   ├── tsconfig.json
│   └── src/
│       └── handlers.ts  → imports from @core
└── web/
    ├── tsconfig.json
    └── src/
        └── components.ts → imports from @core
```

**Config:**
```typescript
defineConfig({
  modules: [{
    name: "app",
    packages: [
      { name: "core", tsconfig: "./packages/core/tsconfig.json" },
      { name: "api", tsconfig: "./packages/api/tsconfig.json" },
      { name: "web", tsconfig: "./packages/web/tsconfig.json" }
    ]
  }]
})
```

**Tests:**
- Cross-package CALLS edges (api → core, web → core)
- Cross-package USES_TYPE edges
- `analyzeImpact(core/types)` - impact across packages

**Benchmark Prompts:**
- "What in the `api` package uses `core` utilities?"
- "If I change a type in `core`, what packages are affected?"

**Why MCP wins:** Impact analysis crosses package boundaries instantly.

---

## Coverage Matrix

### By Edge Type

| Edge | Existing | Planned |
|------|----------|---------|
| CALLS | call-chain, web-app, monorepo, layered-api | shared-utils, event-system |
| IMPORTS | web-app, monorepo | multi-package |
| CONTAINS | All (implicit) | - |
| USES_TYPE | web-app, monorepo | type-system, multi-package |
| EXTENDS | - | type-system |
| IMPLEMENTS | - | type-system |
| READS_PROPERTY | - | property-access |
| WRITES_PROPERTY | - | property-access |

### By Project Structure

| Level | Existing | Planned |
|-------|----------|---------|
| L1: Single package | call-chain, mixed-types, layered-api | shared-utils, type-system, property-access, event-system |
| L2: Multi-package | - | multi-package |
| L2: Multi-module (1 pkg/module) | web-app | - |
| L3: Multi-module (multi-pkg) | monorepo | - |

---

## Implementation Priority

### With Benchmarks (new query patterns)

1. **`shared-utils`** - Wide fan-in pattern, tests `analyzeImpact`
2. **`type-system`** - Type hierarchy, tests EXTENDS/IMPLEMENTS edges

### Integration Tests Only (query patterns already benchmarked)

3. **`multi-package`** - L2 structure (cross-package covered by `monorepo`)
4. **`property-access`** - READS/WRITES edges (impact analysis covered by `shared-utils`)
5. **`event-system`** - Hub pattern (impact analysis covered by `monorepo`)

---

## Benchmark Methodology

For each project, compare Claude Code performance:

**Without MCP tools:**
- Claude reads files manually using Read/Glob/Grep
- Measure: time to answer, number of tool calls, accuracy

**With MCP tools:**
- Claude uses ts-graph-mcp tools
- Measure: time to answer, number of tool calls, accuracy

**Metrics:**
- Time to first correct answer
- Total tool calls required
- Accuracy of response
- Token usage

**Expected outcomes:**
- Small projects (existing): Minimal difference
- Medium projects (L1 planned): Moderate speedup with MCP
- Large projects (L2/L3): Significant speedup with MCP
