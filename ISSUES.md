# Known Issues

## Technical Debt

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

### Watcher Tests Missing

Watcher module lacks unit and system tests. Medium priority.

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

### Gap Indicator Threshold Too Low

**Impact:** Low (token efficiency)

The gap indicator `... N lines omitted ...` should only appear when the gap is substantial (3+ lines). For gaps of 1-2 lines, showing the actual lines uses fewer tokens than the gap indicator itself.

**Current behavior:**
```
    24: const x = prep();
    ... 1 lines omitted ...
    26: target();
```

**Expected behavior:**
```
    24: const x = prep();
    25: const y = setup();
    26: target();
```

**Fix approach:** In `renderLOCs()`, only show gap indicator when `gap >= 3`. For smaller gaps, include the actual lines.

**Location:** `src/tools/shared/formatNodes.ts`

