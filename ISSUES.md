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

### 9. Cross-File CALLS Edges Not Extracted

**Status:** Discovered 2025-12-13, needs investigation

**Problem:** CALLS edges between functions in different files (within the same module) are not being extracted.

**Evidence:**

| Query | Expected | Actual |
|-------|----------|--------|
| `get_callers(encodeNode)` | `groupNodesByType`, `formatSubgraph` | 0 callers |
| `get_callees(encodeNode)` | `encodeFunction`, `encodeClass`, etc. | 0 callees |
| `get_callees(startMcpServer)` | `formatNodesResponse`, etc. | ✅ 3 callees (same-file works) |

**Analysis:**
- Same-file CALLS work: `startMcpServer` → `formatNodesResponse` (both in `McpServer.ts`)
- Cross-file CALLS missing: `groupNodesByType` → `encodeNode` (different files)
- The `encodeNode` function is imported and called, but no CALLS edge is created

**Location:** Likely in `src/ingestion/EdgeExtractors.ts:extractCallEdges`

**Impact:** `get_callers`, `get_callees`, `find_path`, and `get_impact` tools return incomplete results for cross-file function calls. This significantly reduces the usefulness of the call graph for understanding code dependencies.

**Distinction from Issue #5:** Issue #5 is about cross-MODULE edges. This issue is about cross-FILE edges within the SAME module/package.

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

### 8. Missing Test Coverage (Planned but Never Written)

**Status:** Documented, tests pending

**Problem:** Several test files were defined in `docs/IMPLEMENTATION_PLAN.md` but never implemented. Current test count is 184 tests across 11 files, but key modules remain untested.

**Missing Test Files:**

| Planned File | Purpose | Priority |
|--------------|---------|----------|
| `tests/mcp/unit/handlers.test.ts` | MCP handler unit tests with mocked DbReader | High |
| `tests/mcp/integration/tools.test.ts` | MCP tool integration tests with seeded database | High |
| `tests/watcher/unit/api.test.ts` | Watcher API unit tests | Medium |
| `tests/watcher/system/filesystem.test.ts` | Real filesystem change detection tests | Medium |

**Details from IMPLEMENTATION_PLAN.md:**

1. **MCP Server Tests** (High Priority)
   - Unit tests should mock `DbReader` and verify handler behavior
   - Integration tests should use a seeded SQLite database
   - Should cover all 7 MCP tools: `search_nodes`, `get_callers`, `get_callees`, `get_impact`, `find_path`, `get_neighbors`, `get_file_symbols`

2. **Watcher Module Tests** (Medium Priority)
   - Unit tests should mock ingestion and verify the watch API
   - System tests should verify real filesystem change detection
   - Depends on watcher module implementation status

**Risk:** MCP Server (`src/mcp/McpServer.ts`) is actively being modified without test coverage.

**Reference:** See `docs/IMPLEMENTATION_PLAN.md` § Testing Strategy for original test matrix.

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
