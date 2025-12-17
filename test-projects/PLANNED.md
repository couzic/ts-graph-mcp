# Planned Test Projects

This document tracks test projects to be created for integration testing and benchmarking ts-graph-mcp.

## Goals

1. **Integration Testing** - Verify the full stack works (AST → extraction → DB → queries)
2. **Benchmarking** - Compare Claude Code performance with vs without MCP tools
3. **Regression Testing** - Catch bugs when they're fixed (e.g., Issue #5 cross-module edges)

---

## Existing Projects

| Project | Structure | What It Tests | Status |
|---------|-----------|---------------|--------|
| ~~`call-chain`~~ | L1: Single file | Same-file CALLS chain | **Retired** - replaced by `deep-chain` |
| ~~`cross-file-calls`~~ | L1: 3 files | Cross-file CALLS, call count | **Retired** - redundant with unit tests in `extractCallEdges.test.ts` |
| `mixed-types` | L1: 3 files | All 8 node types | **Merge** into `type-system` when implemented |
| `deep-chain` | L1: 10 files | Deep cross-file call chain (10 hops) | **Active** - primary benchmark for traversal |
| `web-app` | L2: 3 modules, 1 pkg each | Cross-module edges, Issue #5 regression | **Active** - 15 tests, all passing |

### Migration Notes

**`call-chain` → `deep-chain`:**
- `call-chain` tested same-file calls (trivial case)
- `deep-chain` tests cross-file calls at depth 10 (comprehensive)
- Same-file is a subset of cross-file; no value in keeping both

**`mixed-types` → `type-system`:**
- When implementing `type-system`, include the node type variations from `mixed-types`:
  - Functions: sync/async, with/without return type annotation
  - Variables: const with/without explicit type
- After migration, delete `mixed-types` project
- Keep integration tests that verify all 8 node types are extracted

---

## Planned Projects

### 1. `deep-chain` (Priority: High)

**Purpose:** Stress-test deep transitive traversal across files.

**Structure:** L1 - Single package, 10 files
```
src/
├── step01.ts  → exports entry(), calls step02()
├── step02.ts  → exports step02(), calls step03()
├── ...
└── step10.ts  → exports step10(), returns result
```

**Tests:**
- `get_callees(entry, maxDepth: 10)` - finds all 10 functions
- `get_callers(step10, maxDepth: 10)` - finds entry through 9 intermediates
- `find_path(entry, step10)` - returns 10-node path
- Recursive CTE performance at depth

**Benchmark Prompts:**
- "What functions does `entry` call transitively?"
- "Trace the call path from `entry` to `step10`"
- "What's the deepest function in the call chain starting from `entry`?"

**Why MCP wins:** Without MCP, Claude must read 10 files sequentially. With `get_callees` → instant.

---

### 2. `shared-utils` (Priority: High)

**Purpose:** Test wide fan-in pattern (many callers to few utilities).

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
- `get_callers(logger)` - returns 10+ callers
- `get_impact(formatDate)` - shows all affected code
- `search_nodes(*validate*)` - pattern matching

**Benchmark Prompts:**
- "What code uses the `logger` function?"
- "If I change `formatDate`, what breaks?"
- "Find all validation functions"

**Why MCP wins:** `get_impact` instantly shows blast radius vs manually tracing imports.

---

### 3. `type-system` (Priority: High)

**Purpose:** Test type-related edges (EXTENDS, IMPLEMENTS, USES_TYPE).

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
- `get_impact(BaseEntity)` - shows entire type hierarchy

**Benchmark Prompts:**
- "What types extend `BaseEntity`?"
- "What classes implement `EntityService`?"
- "If I change the `User` interface, what's affected?"

**Why MCP wins:** Type relationships span many files; `get_impact` reveals full dependency tree.

---

### 4. `layered-api` (Priority: Medium)

**Purpose:** Test realistic layered architecture pattern.

**Structure:** L1 - Single package, ~25 files
```
src/
├── routes/
│   ├── userRoutes.ts    → calls UserController
│   └── orderRoutes.ts   → calls OrderController
├── controllers/
│   ├── UserController.ts  → calls UserService
│   └── OrderController.ts → calls OrderService
├── services/
│   ├── UserService.ts   → calls UserRepository
│   └── OrderService.ts  → calls OrderRepository, UserService
├── repositories/
│   ├── UserRepository.ts  → calls Database
│   └── OrderRepository.ts → calls Database
└── db/
    └── Database.ts      → leaf node
```

**Tests:**
- `find_path(userRoutes, Database)` - 5-hop path through layers
- `get_neighbors(UserService, distance: 2)` - local ecosystem
- Layer boundary verification

**Benchmark Prompts:**
- "How does a user request reach the database?"
- "What's the dependency graph around `UserService`?"
- "What code is between the routes and the database?"

**Why MCP wins:** `find_path` reveals data flow instantly; manual tracing requires reading 5+ files.

---

### 5. `property-access` (Priority: Medium)

**Purpose:** Test READS_PROPERTY and WRITES_PROPERTY edges.

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
- `get_callers(State.count)` with edge type filtering
- `get_impact(State.count)` - all code touching this property

**Benchmark Prompts:**
- "What code reads `state.count`?"
- "What code modifies `state.users`?"
- "What's the impact of changing the `config` property?"

**Why MCP wins:** Property-level impact analysis without reading every file.

---

### 6. `event-system` (Priority: Medium)

**Purpose:** Test hub patterns and `get_neighbors` tool.

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
- `get_neighbors(EventBus, distance: 1)` - all direct connections
- `get_neighbors(EventBus, distance: 2)` - extended ecosystem
- Dense local graph around hub

**Benchmark Prompts:**
- "What's connected to the EventBus?"
- "What handlers process user events?"
- "Show me the event system architecture"

**Why MCP wins:** `get_neighbors` with Mermaid diagram instantly visualizes the hub.

---

### 7. `multi-package` (Priority: High)

**Purpose:** Test cross-package relationships within a module.

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
- `search_nodes({ pattern: "*", package: "core" })` - package filtering
- `get_impact(core/types)` - impact across packages

**Benchmark Prompts:**
- "What in the `api` package uses `core` utilities?"
- "If I change a type in `core`, what packages are affected?"
- "List all exports from the `core` package"

**Why MCP wins:** Package filtering narrows scope; impact analysis crosses package boundaries.

---

### ~~8. `web-app`~~ ✅ IMPLEMENTED (renamed from `monorepo`)

**Status:** Implemented 2025-12-17, Issue #5 fixed

**Purpose:** Test cross-module edges. Now serves as regression test for Issue #5.

**Structure:** L2 - Multi-module (3 modules, 1 package each)

**Tests (15 passing):**
- Cross-module CALLS edges (backend → shared)
- Cross-module USES_TYPE edges (frontend → shared, backend → shared)
- Cross-module IMPORTS edges
- `get_impact` analysis across modules
- Module filtering with `search_nodes`

See `test-projects/web-app/` for implementation.

Note: This is a simplified multi-module structure. For a true monorepo test with
multiple packages per module, see the `monorepo` project below.

---

### 9. `monorepo` (Priority: Medium)

**Purpose:** Test true monorepo structure with multiple packages per module.

**Structure:** L3 - Multi-module monorepo (3 modules, 2+ packages each)
```
modules/
├── shared/
│   └── packages/
│       ├── types/         → core types (User, Config)
│       └── utils/         → shared utilities (formatDate, validate)
├── frontend/
│   └── packages/
│       ├── ui/            → UI components
│       └── state/         → state management, uses types
└── backend/
    └── packages/
        ├── api/           → API handlers
        └── services/      → business logic, uses types + utils
```

**Config:**
```typescript
defineConfig({
  modules: [
    {
      name: "shared",
      packages: [
        { name: "types", tsconfig: "./modules/shared/packages/types/tsconfig.json" },
        { name: "utils", tsconfig: "./modules/shared/packages/utils/tsconfig.json" }
      ]
    },
    {
      name: "frontend",
      packages: [
        { name: "ui", tsconfig: "./modules/frontend/packages/ui/tsconfig.json" },
        { name: "state", tsconfig: "./modules/frontend/packages/state/tsconfig.json" }
      ]
    },
    {
      name: "backend",
      packages: [
        { name: "api", tsconfig: "./modules/backend/packages/api/tsconfig.json" },
        { name: "services", tsconfig: "./modules/backend/packages/services/tsconfig.json" }
      ]
    }
  ]
})
```

**Tests:**
- Cross-package edges within same module (e.g., backend/api → backend/services)
- Cross-module edges between packages (e.g., backend/services → shared/utils)
- Package filtering: `search_nodes({ pattern: "*", package: "utils" })`
- Module + package filtering combined
- `get_impact` at package granularity

**Benchmark Prompts:**
- "What packages in frontend use the shared utils?"
- "If I change the types package, what other packages are affected?"
- "Show dependencies between packages across modules"

**Why this matters:** True monorepos have multiple packages per module. This tests the full L3 structure.

---

## Coverage Matrix

### By MCP Tool

| Tool | Covered By |
|------|------------|
| `search_nodes` | shared-utils, multi-package, web-app ✅, monorepo |
| `get_callers` | deep-chain, shared-utils |
| `get_callees` | deep-chain, layered-api |
| `get_impact` | shared-utils, type-system, property-access, multi-package, web-app ✅, monorepo |
| `find_path` | deep-chain, layered-api |
| `get_neighbors` | event-system, layered-api |
| `get_file_symbols` | All (implicit) |

### By Edge Type

| Edge | Covered By |
|------|------------|
| CALLS | deep-chain, shared-utils, layered-api, event-system, web-app ✅ |
| IMPORTS | multi-package, web-app ✅, monorepo |
| CONTAINS | All (implicit) |
| USES_TYPE | type-system, multi-package, web-app ✅, monorepo |
| EXTENDS | type-system |
| IMPLEMENTS | type-system |
| READS_PROPERTY | property-access |
| WRITES_PROPERTY | property-access |

### By Project Structure

| Level | Projects |
|-------|----------|
| L1: Single package | deep-chain, shared-utils, type-system, layered-api, property-access, event-system |
| L2: Multi-package | multi-package |
| L2: Multi-module (1 pkg/module) | ~~web-app~~ ✅ |
| L3: Multi-module (multi-pkg) | monorepo |

---

## Implementation Priority

1. ~~**Critical:** `web-app` - Cross-module edges, Issue #5 regression~~ ✅ DONE
2. ~~**High:** `deep-chain` - Simple to build, high benchmark value~~ ✅ DONE
3. **High:** `shared-utils` - Tests `get_impact`, common real-world pattern
4. **High:** `type-system` - Tests missing edge types (EXTENDS, IMPLEMENTS)
5. **High:** `multi-package` - L2 multi-package within single module
6. **Medium:** `monorepo` - True L3 structure (multi-pkg per module)
7. **Medium:** `layered-api` - Realistic architecture pattern
8. **Medium:** `property-access` - Tests READS/WRITES_PROPERTY edges
9. **Medium:** `event-system` - Tests `get_neighbors` hub pattern

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
