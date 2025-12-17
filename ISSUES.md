# Known Issues

Last updated: 2025-12-17

## Must Fix

### 14. Memory Scalability: Three-Phase Indexing Holds All Nodes in Memory

**Status:** Partially resolved - edge extraction refactored (2025-12-17)

**Problem:** The Issue #5 fix changed `indexProject` from per-package streaming writes to a three-phase approach that collects ALL nodes in memory before writing. For very large codebases (10K+ files), this could exhaust memory.

**Progress (2025-12-17):**

1. ✅ **Edge extraction no longer needs global nodes array** - All edge extractors refactored:
   - `extractCallEdges` and `extractTypeUsageEdges` use `buildImportMap` for cross-file resolution
   - `extractImportEdges` and `extractContainsEdges` extract directly from AST
   - `extractEdges(sourceFile, context)` signature simplified (no `nodes` parameter)
   - Memory footprint: O(imports in current file) instead of O(all nodes)
   - Resolves imports via ts-morph (no node lookups)
   - Constructs target IDs directly: `targetPath:symbolName`

2. ✅ **FK constraints removed** - Schema no longer has foreign key constraints on edges table:
   - Enables parallel package processing
   - No ordering dependencies
   - Dangling edges filtered out by queries (JOINs)

**Remaining work for streaming:**
- Refactor `indexProject` to write nodes/edges immediately per-file
- Remove `allNodes` and `allEdges` accumulation arrays
- Add progress callbacks for long-running indexing

**Memory comparison (10K files, 500K nodes, 2.5M edges):**

| Approach | Peak Memory |
|----------|-------------|
| Current (all in memory) | ~2-4 GB |
| After streaming refactor | ~50-100 MB |

**Tracking:** See SIMPLIFIED_INGESTION.md for full architecture proposal

---

## Resolved Issues

### ~~5. Cross-Module Edge Resolution~~ ✅ FIXED

**Status:** Fixed 2025-12-17

**Problem:** Edges that cross module boundaries were silently dropped during ingestion.

**Root Cause (discovered during fix):** Two separate bugs:
1. **Source file scope leak:** ts-morph would pull in files from other packages via imports, causing nodes to get wrong module metadata
2. **Per-package edge filtering:** Dangling edge filter ran per-package, dropping cross-module edges

**Fix Applied:** Refactored `indexProject` in `src/ingestion/Ingestion.ts` to use three-phase architecture:

1. **Phase 1:** Extract nodes from ALL packages (builds complete symbol table)
2. **Phase 2:** Extract edges from ALL packages (with complete node set for cross-module resolution)
3. **Phase 3:** Filter dangling edges and write to database

Additional fix: Added package directory filtering to prevent source file scope leak.

**Verification:** Integration test in `test-projects/web-app/integration.test.ts` with 15 tests covering:
- Cross-module CALLS edges (backend → shared)
- Cross-module USES_TYPE edges (frontend → shared, backend → shared)
- Cross-module IMPORTS edges
- `get_impact` analysis across modules

**Scope now:**

| Scenario | Status |
|----------|--------|
| Cross-file (same package) | ✅ Works |
| External dependencies (`node_modules`) | ✅ Filtered out intentionally |
| Cross-package (same module) | ✅ Works |
| Cross-module | ✅ **Works** |

---

### ~~1. SQL Injection Risk in Filter Builders~~ ✅ FIXED

**Location:** `src/db/sqlite/SqliteReader.ts:73-98`

**Fix Applied:** Refactored `buildEdgeTypeFilter` and `buildModuleFilter` to return a `FilterResult` object containing both SQL fragments with `?` placeholders and a params array. All callers now spread the params into their query execution.

---

### ~~2. Unused Variable in ConfigLoader~~ ✅ FIXED

**Location:** `src/config/ConfigLoader.ts:52`

**Fix Applied:** Auto-fixed by `npm run lint:fix` - unused `e` renamed to `_e`.

---

### ~~3. Formatting Issues~~ ✅ FIXED

**Fix Applied:** Ran `npm run lint:fix` which auto-resolved 33 files with formatting inconsistencies.

---

### ~~4. Fragile Enum Check in NodeExtractors~~ ✅ FIXED

**Location:** `src/ingestion/NodeExtractors.ts:325-326`

**Fix Applied:** Imported `VariableDeclarationKind` from ts-morph and replaced `declarationKind.toString() === "const"` with `declarationKind === VariableDeclarationKind.Const`.

---

## Architectural Limitations

*(Cross-module edge resolution moved to "Must Fix Before Release" - see Issue #5 above)*

### ~~11. Cross-File USES_TYPE Edges Not Extracted~~ ✅ FIXED

**Status:** Fixed 2025-12-15

**Problem:** USES_TYPE edges between symbols in **different files** were not being extracted.

**Root Cause:** The `extractTypeUsageEdges` function resolved type references using `generateNodeId(context.filePath, typeName)`, which assumed all types were defined in the same file. Imported types were not in the symbol map.

**Fix Applied:** Applied the same pattern as Issue #9:

1. **Added `includeTypeImports` option to `buildSymbolMap`** (`src/ingestion/extract/edges/buildSymbolMap.ts`):
   - New `BuildSymbolMapOptions` interface with `includeTypeImports` flag
   - When true, includes type-only imports (`import type { User }`) in the map
   - Default is false to maintain existing CALLS edge behavior

2. **Modified `extractTypeUsageEdges`** (`src/ingestion/extract/edges/extractTypeUsageEdges.ts`):
   - Added `nodes: Node[]` parameter
   - Builds type symbol map with `includeTypeImports: true`
   - All helper functions now use symbol map instead of `generateNodeId`

3. **Updated `extractEdges`** (`src/ingestion/extract/edges/extractEdges.ts`):
   - Passes `nodes` array to `extractTypeUsageEdges`

**Verification:** Integration tests in `test-projects/mixed-types/integration.test.ts`:
- USES_TYPE edge from `addUser` method to `User` interface across files ✓
- USES_TYPE edge from `users` property to `User` interface across files ✓
- `get_neighbors(addUser)` → shows `User` from types.ts ✓
- `get_impact(User)` → shows `addUser` and `users` from models.ts ✓

---

### 12. Cross-File EXTENDS/IMPLEMENTS Edges Not Extracted

**Status:** Documented 2025-12-15, not yet fixed

**Problem:** EXTENDS and IMPLEMENTS edges between classes/interfaces in **different files** are not being extracted.

**Example:** When `class AdminUser extends User` where `User` is imported from another file, no EXTENDS edge is created from `AdminUser` to `User`.

**Root Cause:** Same pattern as Issues #9 and #11. The `extractInheritanceEdges` function uses `generateNodeId(context.filePath, ...)` for targets, assuming all base classes/interfaces are defined in the same file.

**Impact:** Medium - `get_neighbors` and `get_impact` tools won't show cross-file inheritance relationships.

**Potential Fix:** Apply the same solution as Issue #9:
1. Enhance `extractInheritanceEdges` to accept a `nodes` array and `SourceFile` parameter
2. Use `buildSymbolMap` to resolve imported classes/interfaces to their node IDs
3. Handle both `extends` and `implements` clauses

**Discovered by:** Code review during Issue #11 planning (2025-12-15)

**Workaround:** None currently. Inheritance relationships across files are not tracked.

---

### ~~9. Cross-File CALLS Edges Not Extracted~~ ✅ FIXED

**Status:** Fixed 2025-12-14

**Problem:** CALLS edges between functions in **different files** were not being extracted.

**Root Cause:** The two-pass extraction in `indexPackage` called `extractFromSourceFile` per-file, which only passed that file's nodes to `extractEdges`. This meant `buildSymbolMap` couldn't resolve imported symbols.

**Fix Applied:** Two changes:

1. **Extracted and enhanced `buildSymbolMap`** (`src/ingestion/extract/edges/buildSymbolMap.ts`):
   - Now accepts optional `SourceFile` parameter
   - Parses import declarations and resolves imported symbols to node IDs
   - Handles aliased imports, default imports, and ESM `.js` extensions

2. **Changed to three-pass architecture** in `Ingestion.ts:110-207`:
   - Pass 1: Extract ALL nodes from ALL files
   - Pass 2: Extract edges with complete node list (enables cross-file resolution)
   - Pass 3: Write to database

**Verification:** All MCP tools now return cross-file CALLS edges:
- `get_callers(buildSymbolMap)` → 6 callers from 5 different files
- `get_callees(extractCallEdges)` → 8 callees from 3 different files
- `find_path(main, generateNodeId)` → 5-hop path across files

---

## Technical Debt

> **Per-tool improvement plans:** Each MCP tool has a `FUTURE_IMPROVEMENTS.md` file in `src/tools/*/` documenting priority improvements, test gaps, and implementation roadmaps.

### 10. Format Test Quality Gaps

**Status:** Documented 2025-12-13, non-blocking

**Problem:** The `format.test.ts` files in `src/tools/*/` have good happy-path coverage but lack edge case and negative tests.

**Gaps Identified:**

| Category | Details |
|----------|---------|
| **Missing edge types** | `find-path/format.test.ts` doesn't test `READS_PROPERTY` or `WRITES_PROPERTY` edges |
| **No negative tests** | No tests for null/undefined inputs, malformed node IDs, empty required fields |
| **Weak assertions** | Many tests use `toContain()` - should use more specific assertions |
| **Missing node types** | `File` node type excluded from output but not explicitly tested |
| **Metadata edge cases** | No tests for nodes with different module/package values (hoisting assumes same) |

**Impact:** Low - tests pass and cover main functionality. These are hardening improvements.

**Reference:** Code review performed 2025-12-13 during vertical slice migration.

---

### 8. Missing Test Coverage

**Status:** Partially resolved 2025-12-15

**Resolved:**

| Test Type | Status | Details |
|-----------|--------|---------|
| MCP tool integration tests | ✅ Done | 51 tests across 3 test projects |

**Remaining gaps:**

| Test Type | Purpose | Priority |
|-----------|---------|----------|
| Watcher unit tests | Mock ingestion, verify watch API | Medium |
| Watcher system tests | Real filesystem change detection | Medium |

**Integration tests added:**
- `test-projects/deep-chain/integration.test.ts` (20 tests) - deep cross-file call chains
- `test-projects/mixed-types/integration.test.ts` (23 tests) - all node types
- `test-projects/web-app/integration.test.ts` (15 tests) - cross-module edges (Issue #5 regression)

**Note:** Handler unit tests were originally planned but deemed unnecessary - handlers are thin plumbing code (query + format), and both layers have their own unit tests.

---

### ~~6. TOON Output Optimization~~ ✅ SUPERSEDED

**Status:** Resolved via vertical slice architecture migration

**What Changed:**
- The `src/toon/` module was **deleted** - TOON encoding approach was replaced
- Each MCP tool now has its own `format.ts` file with direct text output
- Output format is now **hierarchical text** optimized for LLM consumption
- All optimization goals achieved: ~60-70% token reduction vs JSON

**New Architecture (December 2024):**
- All 7 MCP tools migrated to vertical slice pattern (`src/tools/<tool>/`)
- Each tool: `handler.ts` + `query.ts` (direct SQL) + `format.ts` (text output)
- No shared TOON encoding layer - simpler, more maintainable

See [docs/toon-optimization/](./docs/toon-optimization/) for historical analysis that informed the new format.

---

## Nice to Have

### 15. Configuration Too Verbose: Support Flat Package List

**Status:** Enhancement - documented 2025-12-17

**Problem:** The current configuration requires wrapping every package in a module, even when modules aren't needed:

```typescript
// Current - verbose
export default defineConfig({
  modules: [
    {
      name: "shared",
      packages: [{ name: "shared", tsconfig: "./shared/tsconfig.json" }],
    },
    {
      name: "frontend",
      packages: [{ name: "frontend", tsconfig: "./frontend/tsconfig.json" }],
    },
  ],
});
```

For simple projects or when module grouping isn't meaningful, a flat package list would be cleaner:

```typescript
// Proposed - simpler
export default defineConfig({
  packages: [
    { name: "shared", tsconfig: "./shared/tsconfig.json" },
    { name: "frontend", tsconfig: "./frontend/tsconfig.json" },
  ],
});
```

**Why it matters:**
- Most projects don't need module grouping
- Current format has redundant `name` fields (module name often matches package name)
- Simpler configs are easier to understand and maintain
- Reduces barrier to adoption

**Proposed solution:**
1. Accept either `modules` (current) or `packages` (new flat format)
2. When `packages` is used, auto-generate a single module named "default" containing all packages
3. Validate that only one of `modules` or `packages` is provided

**Impact:** Low - purely a DX improvement, no functional change

---

### 13. `find_path` Should Return Multiple Paths

**Status:** Enhancement - not blocking, current behavior is valid for many use cases

**Problem:** Currently `find_path` returns only the shortest path between two nodes. In real codebases, there can be multiple paths connecting two nodes (e.g., `Controller` reaches `Database` through both `Service` and `Cache`).

**Why it matters:**
- Understanding all connection routes is valuable for impact analysis
- "How many ways can data flow from A to B?" is a valid question
- Single shortest path may miss important indirect dependencies

**Potential solutions:**
1. Add a `limit` parameter to return top N shortest paths
2. Create a new `find_paths` tool alongside existing `find_path`
3. Add an `all: boolean` parameter to get all paths up to maxDepth

**Tradeoffs:**
- Multiple paths can be expensive to compute (factorial complexity)
- Need to decide: K-shortest-paths algorithm or all paths with maxDepth limit?
- Output format needs to distinguish between paths clearly

**Priority:** Enhancement - nice to have but not critical

---

### 7. Missing JSDoc on Some Exports

**Problem:** A few exported functions lack JSDoc documentation.

**Fix:** Add JSDoc with `@param` and `@returns` for public API functions.
