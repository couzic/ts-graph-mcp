# Known Issues

## MCP Tool Discoverability

### Trigger Phrases — Validation Pending

**Impact:** High (tool adoption)

**Problem:** Claude Code uses natural language patterns that should trigger MCP tool calls, but may fall back to Read/Grep in longer sessions.

**Priority phrases** (observed in real usage):
- "trace the data flow"
- "trace through the code"
- "analyze logic"

**Done:**
- ✅ Updated tool descriptions to include trigger phrases (in `mcp/src/wrapper.ts`)

**Remaining:**
- Run benchmarks to validate trigger phrases work in longer sessions
- If issues persist, investigate context window / attention patterns

**Full catalog of phrases to support (future):**

| Tool | Phrase Patterns |
|------|-----------------|
| `dependenciesOf` | "what happens when X runs", "follow the call chain", "step through X", "walk through X", "execution flow" |
| `dependentsOf` | "who calls X", "what depends on X", "impact of changing X", "what would break", "find all usages", "callers of X", "refactoring X" |
| `pathsBetween` | "how does A reach B", "path between A and B", "connection between", "how does A use B", "flow from A to B" |

---

## Technical Debt

---

### Magic Numbers for Traversal Depth Limits

**Impact:** Low (maintainability)

Hardcoded depth limit in query file:

- `http/src/query/paths-between/query.ts` — `maxDepth = 20`

**Fix approach:**

Create `http/src/query/shared/queryConstants.ts`:
```typescript
export const MAX_PATH_LENGTH = 20;
```

---

### REFERENCES Edge Test Gaps

**Impact:** Medium (edge case coverage)

The REFERENCES edge extractor has basic coverage (13 unit tests, 16 e2e tests) but lacks:

1. **Nested patterns** - Objects inside arrays (`[{ handler: fn }]`) not extracted
2. **Method call arguments** - `map.set(key, fn)` not captured as callback
3. **Destructuring patterns** - `const { handler } = obj; handler()` not tracked
4. **Spread patterns** - `[...handlers]` not tracked
5. **Database query tests** - No tests for `referenceContext` filtering

**Current coverage:**
- `http/src/ingestion/extract/edges/extractReferenceEdges.test.ts` — 13 unit tests (basic patterns)
- `sample-projects/references/e2e.test.ts` — 16 tests via `queryPath` (tool behavior)

**Fix approach:** Add unit tests for edge cases; document unsupported patterns.

---

### Watcher: Fresh Project Per File (Intentional)

**Impact:** Low (performance)

**Current behavior:** `http/src/ingestion/watchProject.ts` creates a fresh ts-morph `Project` for each file change (twice: once for tsconfig validation, once for extraction).

**Why:** Cached Projects don't know about files added since cache creation. When files are added/modified concurrently, cross-file import resolution fails with stale caches.

**Trade-off:** Correctness over performance. Single-file reindexing is typically fast enough (~100-500ms).

**Future optimization:** If perf becomes an issue, consider batch-level caching (refresh cache at start of each debounced batch, not per-file).

---

### Watcher Unit Tests Missing

Watcher module has E2E tests (`http/src/ingestion/watchProject.e2e.test.ts`) but lacks unit tests for:
- `createDebouncer()` — batching and flush behavior
- `resolveFileContext()` — file-to-package mapping
- `isValidTsconfigFile()` — tsconfig validation

Low priority since E2E tests cover the main flows.

### Format Test Gaps

Format tests have good happy-path coverage but lack edge cases and negative tests. Low priority.

---

### Missing E2E Tests for Traversal Edge Cases

**Impact:** Medium (observability)

No E2E tests verify behavior when:
1. Traversal hits max depth limit — should output indicate truncation?
2. Results are truncated due to size limits
3. Circular dependencies are encountered

Users currently can't tell if they're seeing the full picture or a partial view.

**Fix approach:** Add E2E tests that create deep/circular graphs and verify output includes truncation indicators when applicable.

---

### Case-Insensitive Symbol Lookup Uses Full Table Scan

**Impact:** Low (performance)

**Problem:** `findSymbolElsewhere()` in `http/src/query/shared/symbolNotFound.ts` uses `LOWER()` on both sides of the comparison:

```sql
SELECT file_path, type FROM nodes WHERE LOWER(name) = LOWER(?) AND file_path != ? LIMIT 5
```

This prevents SQLite from using any index on `name`, causing a full table scan.

**Current mitigation:** `LIMIT 5` caps the result set, making the scan acceptable for typical codebases.

**Future options:**
1. Add a `name_lower` column with index (adds storage/write overhead)
2. Use SQLite's `COLLATE NOCASE` on the column definition
3. Accept as-is since it only runs on error paths

---

### Edge Types Duplication

**Impact:** Low (maintainability)

**Problem:** Edge types are defined in two places that can go out of sync:

1. `http/src/db/Types.ts` — `EdgeType` union type (source of truth for all edge types)
2. `http/src/query/shared/constants.ts` — `EDGE_TYPES` array (subset used by traversal tools)

```typescript
// Types.ts
export type EdgeType =
  | "CALLS" | "IMPORTS" | "CONTAINS" | "IMPLEMENTS"
  | "EXTENDS" | "USES_TYPE" | "REFERENCES" | "INCLUDES";

// constants.ts
export const EDGE_TYPES = ["CALLS", "INCLUDES", "REFERENCES", "EXTENDS", "IMPLEMENTS"];
```

No compile-time check ensures `EDGE_TYPES` values are valid `EdgeType` members.

**Fix approach:**

Option 1 — Type-safe array in constants.ts:
```typescript
import { EdgeType } from "../../db/Types.js";
export const EDGE_TYPES: EdgeType[] = ["CALLS", "INCLUDES", "REFERENCES", "EXTENDS", "IMPLEMENTS"];
```

Option 2 — Derive type from array (if array should be source of truth):
```typescript
export const EDGE_TYPES = ["CALLS", "INCLUDES", "REFERENCES", "EXTENDS", "IMPLEMENTS"] as const;
export type TraversalEdgeType = typeof EDGE_TYPES[number];
```

---

### Workspace Map Rebuilt Per createProject() Call

**Impact:** Low (performance)

**Problem:** `buildWorkspaceMap()` is called every time `createProject()` is invoked. In `http/src/ingestion/ProjectRegistry.ts`, `indexProject`, `syncOnStartup`, and `watchProject`, each creates projects independently, rebuilding the workspace map each time.

For large monorepos with many packages, this adds overhead: parsing all `package.json` files, expanding workspace globs, inferring source entries from tsconfig.

**Current behavior:** Acceptable for typical monorepos (~10-50 packages). May become noticeable with 100+ packages.

**Fix approach:** Cache the workspace map at the `ProjectRegistry` level and pass it to `createProject()`.

---

### No Cycle Detection in Workspace Traversal

**Impact:** Low (edge case)

**Problem:** `http/src/ingestion/buildWorkspaceMap.ts` has recursive functions (`processWorkspaceRoot`, `findAllPackageDirectories`) that could loop infinitely if workspace definitions are circular:

```json
// package-a/package.json
{ "workspaces": ["../package-b"] }

// package-b/package.json
{ "workspaces": ["../package-a"] }
```

**Likelihood:** Very low — circular workspace definitions are invalid and break Yarn/npm.

**Fix approach:** Track visited directories in a Set and skip already-processed paths.

---

### Namespace Call Resolution Iterates All Exports

**Impact:** Low (performance)

**Problem:** `resolveNamespaceCallCrossPackage()` in `http/src/ingestion/extract/edges/extractCallEdges.ts` iterates through all export declarations in the barrel file for each namespace property call (e.g., `MathUtils.multiply()`).

**In `http/src/ingestion/extract/edges/extractCallEdges.ts`:**
```typescript
for (const exportDecl of barrelFile.getExportDeclarations()) {
  const namespaceExport = exportDecl.getNamespaceExport();
  if (namespaceExport && namespaceExport.getName() === baseName) {
    // resolve...
  }
}
```

**Likelihood:** Low — most barrel files have few namespace exports. Only affects files with many `export * as X from` statements.

**Future optimization:** If perf becomes an issue, cache namespace-to-export-declaration mappings per barrel file during indexing.

---

### Cross-Package Path Alias Resolution

**Impact:** Medium (edge case) — **RESOLVED**

**Problem:** When a barrel file uses path aliases that are defined in its package's tsconfig (not the consumer's tsconfig), resolution fails if we use the consumer's ts-morph Project context.

**Example:**
```
frontend/App.ts imports { LoadingWrapper } from "@libs/ui"
  → resolves to libs/ui/src/index.ts (barrel file)
  → barrel has: export { default as LoadingWrapper } from "@/components/LoadingWrapper/LoadingWrapper"
  → @/components/* is defined in libs/ui/tsconfig.json, NOT frontend's tsconfig
  → Resolution fails because we're in frontend's Project context
```

**Solution implemented:**
- `ProjectRegistry` maps file paths to their owning ts-morph Project
- `buildImportMap.ts` detects when `followAliasChain()` returns "unknown" (resolution failed)
- Falls back to `resolveExportInBarrel()` using the barrel file's correct Project context

**Files:**
- `http/src/ingestion/ProjectRegistry.ts` — Maps files to Projects
- `http/src/ingestion/extract/edges/buildImportMap.ts` — Cross-package resolution logic

**Test coverage:**
- `sample-projects/path-aliases/` — Tests transparent re-exports with path aliases
- `sample-projects/yarn-pnp-monorepo/` — Tests cross-package path alias in barrel re-exports

---

### Shared Types Package Unused

**Impact:** Low (tech debt)

**Problem:** `shared/src/index.ts` defines types (`Node`, `Edge`, `NodeType`, `EdgeType`, etc.) but nothing imports from `@ts-graph/shared` yet. The actual code uses local type definitions in `http/src/db/Types.ts`.

**Current state:**
- `shared/src/index.ts` has comprehensive type definitions
- `http/src/db/Types.ts` has the actual types used by the codebase
- Duplication exists between the two

**Fix approach:** Either:
1. Migrate `http/src/db/Types.ts` to import from `@ts-graph/shared`
2. Or delete `shared/src/index.ts` and keep types in `http/src/db/Types.ts`

Low priority — can be addressed when the UI needs shared types.

---

### Config Loaded Twice in HTTP Server

**Impact:** Low (minor inefficiency)

**Problem:** In `http/src/server.ts`, `loadConfigOrDetect()` is called twice:
- Line 36: inside `indexAndOpenDb()` for indexing configuration
- Line 243: in `startHttpServer()` for reading the port

**Fix approach:** Call `loadConfigOrDetect()` once at the start of `startHttpServer()` and pass the config to `indexAndOpenDb()`.
