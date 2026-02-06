# Known Issues

## Dangling Edges from Inline Methods

**Impact:** Medium (incorrect graph traversal)

**Problem:** Edge extractor creates edges to targets that the node extractor
doesn't create nodes for. This causes silent graph truncation.

**Example:**

```typescript
// Factory function with inline methods
export const createService = () => ({
  doSomething: () => { ... }  // No node created
});

// Caller
const service = createService();
service.doSomething();  // Edge created to "doSomething" - but no node exists
```

**Current behavior:**

1. Edge extractor sees `service.doSomething()`, creates edge targeting
   `doSomething`
2. Node extractor doesn't create node (inline arrow function in object literal)
3. Query JOINs with nodes table, silently filters out the dangling edge
4. Graph stops at `service` with no indication something is missing

**Root cause:** Edge extractor and node extractor have inconsistent definitions
of "what is a symbol". Edge extractor creates edges to anything that looks
callable. Node extractor only creates nodes for explicit declarations.

**Fix approach:** Edge extractor should validate that target would produce a
valid node before creating an edge. This requires:

1. Define explicit rules for "what is a node" (functions, classes, methods,
   etc.)
2. Edge extractor checks target against these rules before creating edge
3. If target wouldn't be a node, skip edge creation (or log warning)

**Workaround:** Use classes instead of factory functions when graph traversal is
needed.

---

## Branded Types Not Enforced

**Impact:** Low (type safety)

**Problem:** `FilePath`, `SymbolName`, and `NodeId` in `shared/src/index.ts` are
defined as `string` aliases, providing no compile-time distinction between them.

**Goal:** Use literal string branded types to prevent mixing up these values:

```typescript
export type FilePath = "FilePath";
export type SymbolName = "SymbolName";
export type NodeId = `${FilePath}:${NodeType}:${SymbolName}`;
```

**Current state:** Types are `string` aliases. The branded type definitions are
preserved in TODO comments.

**Blocked by:** 156 call sites in extractors and tests pass raw strings to
`generateNodeId()`. Each needs explicit casting or a helper function.

**Fix approach:**

1. Create a helper: `asFilePath(path: string): FilePath`
2. Update all `generateNodeId()` call sites to use the helper
3. Restore branded type definitions

---

## MCP Tool Discoverability

### Trigger Phrases — Validation Pending

**Impact:** High (tool adoption)

**Problem:** Claude Code uses natural language patterns that should trigger MCP
tool calls, but may fall back to Read/Grep in longer sessions.

**Priority phrases** (observed in real usage):

- "trace the data flow"
- "trace through the code"
- "analyze logic"

**Current state:** Tool description in `mcp/src/wrapper.ts` includes trigger
phrases.

**Next steps:**

- Run benchmarks to validate trigger phrases work in longer sessions
- If issues persist, investigate context window / attention patterns

**Phrase patterns for `searchGraph`:**

| Query Type                   | Phrase Patterns                                                                               |
| ---------------------------- | --------------------------------------------------------------------------------------------- |
| Forward traversal (`from`)   | "what happens when X runs", "follow the call chain", "step through X", "execution flow"       |
| Backward traversal (`to`)    | "who calls X", "what depends on X", "impact of changing X", "find all usages", "callers of X" |
| Path finding (`from` + `to`) | "how does A reach B", "path between A and B", "connection between", "flow from A to B"        |
| Semantic search (`topic`)    | "find code related to", "where do we handle", "show me the authentication flow"               |

---

## Technical Debt

---

### Inconsistent Logging

**Impact:** Low (maintainability)

**Problem:** Some modules use direct `console.log`/`console.error` calls instead
of the injected `Logger`. This makes it impossible to fully silence output
during tests.

**Current state:**

- `http/src/server.ts` uses injected `Logger`
- `http/src/ingestion/watchProject.ts` uses its own `silent` flag with direct
  `console.error`
- Other modules may have direct console calls

**Fix approach:** Audit codebase for direct console calls and delegate to the
logger where appropriate. Consider whether `watchProject` should also accept an
injected logger instead of a `silent` boolean.

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

The REFERENCES edge extractor has basic coverage (13 unit tests, 16 e2e tests)
but lacks:

1. **Nested patterns** - Objects inside arrays (`[{ handler: fn }]`) not
   extracted
2. **Method call arguments** - `map.set(key, fn)` not captured as callback
3. **Destructuring patterns** - `const { handler } = obj; handler()` not tracked
4. **Spread patterns** - `[...handlers]` not tracked
5. **Database query tests** - No tests for `referenceContext` filtering

**Current coverage:**

- `http/src/ingestion/extract/edges/extractReferenceEdges.test.ts` — 13 unit
  tests (basic patterns)
- `sample-projects/references/e2e.test.ts` — 16 tests via `queryPath` (tool
  behavior)

**Fix approach:** Add unit tests for edge cases; document unsupported patterns.

---

### Watcher: Fresh Project Per File (Intentional)

**Impact:** Low (performance)

**Current behavior:** `http/src/ingestion/watchProject.ts` creates a fresh
ts-morph `Project` for each file change (twice: once for tsconfig validation,
once for extraction).

**Why:** Cached Projects don't know about files added since cache creation. When
files are added/modified concurrently, cross-file import resolution fails with
stale caches.

**Trade-off:** Correctness over performance. Single-file reindexing is typically
fast enough (~100-500ms).

**Future optimization:** If perf becomes an issue, consider batch-level caching
(refresh cache at start of each debounced batch, not per-file).

---

### Watcher Unit Tests Missing

Watcher module has integration tests
(`http/src/ingestion/watchProject.integration.test.ts`) and server E2E tests
(`http/src/server.e2e.test.ts`) but lacks unit tests for:

- `bufferDebounce()` — RxJS batching and flush behavior
- `resolveFileContext()` — file-to-package mapping
- `isValidTsconfigFile()` — tsconfig validation

Low priority since integration and E2E tests cover the main flows.

### Format Test Gaps

Format tests have good happy-path coverage but lack edge cases and negative
tests. Low priority.

---

### Missing E2E Tests for Traversal Edge Cases

**Impact:** Medium (observability)

No E2E tests verify behavior when:

1. Traversal hits max depth limit — should output indicate truncation?
2. Circular dependencies are encountered

Users currently can't tell if they're seeing the full picture or a partial view.

**Fix approach:** Add E2E tests that create deep/circular graphs and verify
output includes truncation indicators when applicable.

---

### Missing Fully Qualified Symbol Name Column

**Impact:** Low (performance optimization)

**Problem:** The `nodes` table stores `name` (short name like `errors`) but not
the fully qualified symbol path (like `IndexResult.errors`). To get the full
path, we extract it from the node ID using `SUBSTR(id, INSTR(id, ':') + 1)`.

**Example:**

- Node ID: `http/src/db/Types.ts:IndexResult.errors`
- `name` column: `errors`
- Needed for symbol resolution: `IndexResult.errors`

**Current workaround:** Both `findSymbolMatches()` in `symbolNotFound.ts` and
`/api/symbols` endpoint use `SUBSTR(id, INSTR(id, ':') + 1)` to extract the
symbol path at query time. This works correctly but computes the value on every
query.

**Future optimization:** Add a `symbol_path` column to the nodes table that
stores the fully qualified name (`ClassName.methodName`). This would:

1. Simplify queries (no string manipulation)
2. Enable proper indexing for symbol lookups
3. Make the data model more explicit

---

### Case-Insensitive Symbol Lookup Uses Full Table Scan

**Impact:** Low (performance)

**Problem:** `findSymbolElsewhere()` in
`http/src/query/shared/symbolNotFound.ts` uses `LOWER()` on both sides of the
comparison:

```sql
SELECT file_path, type FROM nodes WHERE LOWER(name) = LOWER(?) AND file_path != ? LIMIT 5
```

This prevents SQLite from using any index on `name`, causing a full table scan.

**Current mitigation:** `LIMIT 5` caps the result set, making the scan
acceptable for typical codebases.

**Future options:**

1. Add a `name_lower` column with index (adds storage/write overhead)
2. Use SQLite's `COLLATE NOCASE` on the column definition
3. Accept as-is since it only runs on error paths

---

### Edge Types Duplication

**Impact:** Low (maintainability)

**Problem:** Edge types are defined in two places that can go out of sync:

1. `http/src/db/Types.ts` — `EdgeType` union type (source of truth for all edge
   types)
2. `http/src/query/shared/constants.ts` — `EDGE_TYPES` array (used by traversal)

No compile-time check ensures `EDGE_TYPES` values are valid `EdgeType` members.

**Fix approach:**

Type-safe array in constants.ts:

```typescript
import { EdgeType } from "../../db/Types.js";
export const EDGE_TYPES: EdgeType[] = [
  "CALLS",
  "INCLUDES",
  // ...
];
```

---

### Workspace Map Rebuilt Per createProject() Call

**Impact:** Low (performance)

**Problem:** `buildWorkspaceMap()` is called every time `createProject()` is
invoked. In `http/src/ingestion/ProjectRegistry.ts`, `indexProject`,
`syncOnStartup`, and `watchProject`, each creates projects independently,
rebuilding the workspace map each time.

For large monorepos with many packages, this adds overhead: parsing all
`package.json` files, expanding workspace globs, inferring source entries from
tsconfig.

**Current behavior:** Acceptable for typical monorepos (~10-50 packages). May
become noticeable with 100+ packages.

**Fix approach:** Cache the workspace map at the `ProjectRegistry` level and
pass it to `createProject()`.

---

### No Cycle Detection in Workspace Traversal

**Impact:** Low (edge case)

**Problem:** `http/src/ingestion/buildWorkspaceMap.ts` has recursive functions
(`processWorkspaceRoot`, `findAllPackageDirectories`) that could loop infinitely
if workspace definitions are circular:

```json
// package-a/package.json
{ "workspaces": ["../package-b"] }

// package-b/package.json
{ "workspaces": ["../package-a"] }
```

**Likelihood:** Very low — circular workspace definitions are invalid and break
Yarn/npm.

**Fix approach:** Track visited directories in a Set and skip already-processed
paths.

---

### Namespace Call Resolution Iterates All Exports

**Impact:** Low (performance)

**Problem:** `resolveNamespaceCallCrossPackage()` in
`http/src/ingestion/extract/edges/extractCallEdges.ts` iterates through all
export declarations in the barrel file for each namespace property call (e.g.,
`MathUtils.multiply()`).

**In `http/src/ingestion/extract/edges/extractCallEdges.ts`:**

```typescript
for (const exportDecl of barrelFile.getExportDeclarations()) {
  const namespaceExport = exportDecl.getNamespaceExport();
  if (namespaceExport && namespaceExport.getName() === baseName) {
    // resolve...
  }
}
```

**Likelihood:** Low — most barrel files have few namespace exports. Only affects
files with many `export * as X from` statements.

**Future optimization:** If perf becomes an issue, cache
namespace-to-export-declaration mappings per barrel file during indexing.

---

### Shared Types Package Unused

**Impact:** Low (tech debt)

**Problem:** `shared/src/index.ts` defines types (`Node`, `Edge`, `NodeType`,
`EdgeType`, etc.) but nothing imports from `@ts-graph/shared` yet. The actual
code uses local type definitions in `http/src/db/Types.ts`.

**Current state:**

- `shared/src/index.ts` has comprehensive type definitions
- `http/src/db/Types.ts` has the actual types used by the codebase
- Duplication exists between the two

**Fix approach:** Either:

1. Migrate `http/src/db/Types.ts` to import from `@ts-graph/shared`
2. Or delete `shared/src/index.ts` and keep types in `http/src/db/Types.ts`

Low priority — can be addressed when the UI needs shared types.

---

### ServerHandle.close() Missing Error Handling

**Impact:** Low (edge case)

**Problem:** In `http/src/server.ts`, the `close()` function chains
`watchHandle.close()` before closing the server and database. If
`watchHandle.close()` throws, the promise chain breaks and server/db may not
close properly.

```typescript
const close = async (): Promise<void> => {
  if (watchHandle) {
    await watchHandle.close(); // If this throws, server and db stay open
  }
  return new Promise((resolve) => {
    server.close(() => {
      db.close();
      resolve();
    });
  });
};
```

**Fix approach:** Wrap watcher close in try/finally:

```typescript
const close = async (): Promise<void> => {
  try {
    if (watchHandle) await watchHandle.close();
  } finally {
    return new Promise((resolve) => {
      server.close(() => {
        db.close();
        resolve();
      });
    });
  }
};
```

---

### pathsBetween Fails Fast on First Resolution Error

**Impact:** Low (UX)

**Problem:** When both `from` and `to` symbols fail to resolve in
`pathsBetween`, only the first error is shown. The user doesn't know if both
symbols are invalid.

```typescript
// pathsBetween.ts
const fromResolution = resolveSymbol(db, from.file_path, from.symbol);
if (!fromResolution.success) {
  return fromResolution.error; // Stops here, toResolution never attempted
}

const toResolution = resolveSymbol(db, to.file_path, to.symbol);
if (!toResolution.success) {
  return toResolution.error;
}
```

**Example:**

```typescript
// User calls with two invalid symbols:
pathsBetween({ from: "a.ts:invalidA", to: "b.ts:invalidB" })

// Current output (only first error):
Symbol 'invalidA' not found at a.ts

// Better output (both errors):
Symbol 'invalidA' not found at a.ts
Symbol 'invalidB' not found at b.ts
```

**Fix approach:** Resolve both symbols before checking for errors, then combine
error messages if both failed.

---

### No Test Coverage for Missing Config Path

**Impact:** Low (edge case)

**Problem:** In `http/src/server.ts`, when `loadConfigOrDetect()` returns null
(no config file or tsconfig.json found), `indexAndOpenDb()` returns early with
`config: null`. The watcher correctly doesn't start in this case, but no test
verifies this behavior.

```typescript
if (!configResult) {
  console.error(
    "[ts-graph] No config file or tsconfig.json found. Nothing to index.",
  );
  return {
    db,
    indexedFiles: 0,
    manifest: { version: 1, files: {} },
    config: null,
  };
}
```

**Current state:** The code handles the edge case correctly, but tests only
cover the happy path (config exists).

**Fix approach:** Add a test in `server.e2e.test.ts` that starts the server in
an empty directory and verifies it handles gracefully (no crash, returns valid
ServerHandle).
