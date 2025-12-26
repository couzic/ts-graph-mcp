# Known Issues

## Technical Debt

### 18. Magic Numbers for Traversal Depth Limits

**Impact:** Low (maintainability)

Hardcoded depth limits scattered across query files:

- `src/tools/incoming-calls-deep/query.ts` — `?? 100`
- `src/tools/outgoing-calls-deep/query.ts` — `= 100`
- `src/tools/analyze-impact/query.ts` — `?? 100`
- `src/tools/find-paths/query.ts` — `20` (inconsistent with others)

**Fix approach:**

Create `src/tools/shared/queryConstants.ts`:
```typescript
export const DEFAULT_MAX_TRAVERSAL_DEPTH = 100;
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
5. **Database query tests** - No tests for `referenceContext` filtering via `queryEdges`

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

### Nodes Section Ordering

**Impact:** High (test maintainability)

Tool output `## Nodes` section has arbitrary ordering based on graph traversal. Sorting nodes would make golden master tests more readable and diffs easier to review.

**Fix approach:** Order nodes by appearance in the Graph section.
