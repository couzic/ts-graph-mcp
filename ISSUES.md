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
- ✅ Updated tool descriptions to include trigger phrases (`src/mcp/toolDescriptions.ts`)

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

### Race Condition in HTTP Server Spawn

**Impact:** Low (edge case)

**Problem:** When multiple Claude Code sessions start simultaneously for the same project, each stdio MCP wrapper checks for an existing HTTP server and spawns one if not found. A race window exists between the check and the spawn.

**In `wrapperClient.ts:112-117`:**
```typescript
let server = await getRunningServer(cacheDir);

if (!server) {
  spawnApiServer(options);           // ← Both sessions reach here
  server = await waitForApiServer(cacheDir);
}
```

**Consequences:**
1. Second spawn may fail with port conflict (if first server claimed the port)
2. Orphan processes if spawn succeeds but server.json is overwritten
3. `waitForApiServer` may connect to the "wrong" server (benign since they're identical)

**Likelihood:** Low — requires exact timing. In practice, the first session starts the server before others launch.

**Mitigation options:**
1. File-based locking before spawn (add complexity)
2. Retry logic in `waitForApiServer` if health check succeeds after spawn fails (simple)
3. Accept as known limitation (current approach)

**Current behavior:** Second session's spawn fails silently (detached process), but `waitForApiServer` succeeds by connecting to the first session's server. Net effect: works correctly, logs may be confusing.

---

### 18. Magic Numbers for Traversal Depth Limits

**Impact:** Low (maintainability)

Hardcoded depth limit in query file:

- `src/tools/find-paths/query.ts` — `maxDepth = 20`

**Fix approach:**

Create `src/tools/shared/queryConstants.ts`:
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
- `extractReferenceEdges.test.ts` — 13 unit tests (basic patterns)
- `references/e2e.test.ts` — 16 tests via `queryPath` (tool behavior)

**Fix approach:** Add unit tests for edge cases; document unsupported patterns.

---

### Watcher: Fresh Project Per File (Intentional)

**Impact:** Low (performance)

**Current behavior:** `watchProject.ts` creates a fresh ts-morph `Project` for each file change (twice: once for tsconfig validation, once for extraction).

**Why:** Cached Projects don't know about files added since cache creation. When files are added/modified concurrently, cross-file import resolution fails with stale caches.

**Trade-off:** Correctness over performance. Single-file reindexing is typically fast enough (~100-500ms).

**Future optimization:** If perf becomes an issue, consider batch-level caching (refresh cache at start of each debounced batch, not per-file).

---

### Watcher Unit Tests Missing

Watcher module has E2E tests (`watchProject.e2e.test.ts`) but lacks unit tests for:
- `createDebouncer()` — batching and flush behavior
- `resolveFileContext()` — file-to-package mapping
- `isValidTsconfigFile()` — tsconfig validation

Low priority since E2E tests cover the main flows.

### Format Test Gaps

Format tests have good happy-path coverage but lack edge cases and negative tests. Low priority.

---

### Nodes Without Call Sites Show Full Snippet

**Impact:** Medium (token efficiency)

**Problem:** When a node has no call sites (leaf nodes in the dependency graph), `extractSnippet` falls through to `extractLineRange` which returns the entire function body regardless of size.

**Example:** `dependenciesOf(startMcpServer)` with ~25 nodes returns `contextLines = 0`, but `extractLOCsAroundCallSites` (43 lines, no call sites) shows its full body instead of being truncated.

**Root cause in `extractSnippet.ts:29-35`:**
```typescript
const useCallSites =
  callSites && callSites.length > 0 && functionLines > contextLines * 2;

if (useCallSites) {
  return extractLOCsAroundCallSites(lines, callSites, contextLines);
}
return extractLineRange(lines, startLine, endLine);  // ← FULL FUNCTION
```

When `callSites` is empty, the adaptive context logic is bypassed entirely.

**Fix approach:** Limit snippet for nodes without call sites:
```typescript
if (!callSites || callSites.length === 0) {
  const maxLines = Math.max(contextLines, 5); // At least signature
  const limitedEnd = Math.min(endLine, startLine + maxLines - 1);
  return extractLineRange(lines, startLine, limitedEnd);
}
```

---

### Missing E2E Tests for Traversal Edge Cases

**Impact:** Medium (observability)

No E2E tests verify behavior when:
1. Traversal hits max depth limit — should output indicate truncation?
2. Results are truncated due to size limits
3. Circular dependencies are encountered

Users currently can't tell if they're seeing the full picture or a partial view.

**Fix approach:** Add E2E tests that create deep/circular graphs and verify output includes truncation indicators when applicable.
