# Known Issues

Last updated: 2025-12-13

## Must Fix Before Release

*No critical issues - all resolved!*

---

## Resolved Issues

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

### 5. Cross-Module Edge Resolution

**Status:** Documented, not yet fixed

**Problem:** Edges that cross module boundaries are silently dropped during ingestion.

**Details:** See [EDGE_RESOLUTION.md](./EDGE_RESOLUTION.md) for full design discussion and potential solutions.

**Workaround:** Structure your config so interdependent code is in the same module.

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

### 10. Format Test Quality Gaps

**Status:** Documented 2025-12-13, non-blocking

**Problem:** The `format.test.ts` files in `src/mcp/tools/*/` have good happy-path coverage but lack edge case and negative tests.

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

**Status:** In progress

**Remaining gaps:**

| Test Type | Purpose | Priority |
|-----------|---------|----------|
| MCP tool integration tests | Test ingestion → query with real TS code | High |
| Watcher unit tests | Mock ingestion, verify watch API | Medium |
| Watcher system tests | Real filesystem change detection | Medium |

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
- All 7 MCP tools migrated to vertical slice pattern (`src/mcp/tools/<tool>/`)
- Each tool: `handler.ts` + `query.ts` (direct SQL) + `format.ts` (text output)
- No shared TOON encoding layer - simpler, more maintainable

See [docs/toon-optimization/](./docs/toon-optimization/) for historical analysis that informed the new format.

---

## Nice to Have

### 7. Missing JSDoc on Some Exports

**Problem:** A few exported functions lack JSDoc documentation.

**Fix:** Add JSDoc with `@param` and `@returns` for public API functions.
