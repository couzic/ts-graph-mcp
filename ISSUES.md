# Known Issues

## Enhancements

### 13. `findPaths` Multiple Paths

**Impact:** Low

Currently returns only shortest path. Could add a `limit` parameter for top N paths.

---

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

### Watcher Tests Missing

Watcher module lacks unit and system tests. Medium priority.

### Format Test Gaps

Format tests have good happy-path coverage but lack edge cases and negative tests. Low priority.
