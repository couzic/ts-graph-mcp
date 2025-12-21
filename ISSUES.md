# Known Issues

## Open Issues

(None currently)

---

## Enhancements

### 13. `findPath` Multiple Paths

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
- `src/tools/find-path/query.ts` — `20` (inconsistent with others)

**Fix approach:**

Create `src/tools/shared/queryConstants.ts`:
```typescript
export const DEFAULT_MAX_TRAVERSAL_DEPTH = 100;
export const MAX_PATH_LENGTH = 20;
```

---

### 19. File Naming Convention Violations

**Impact:** Low (consistency)

9 files export functions but use PascalCase (convention requires camelCase for function exports):

| Current | Primary Export | Should Be |
|---------|----------------|-----------|
| `src/ingestion/IdGenerator.ts` | `generateNodeId()` | `generateNodeId.ts` |
| `src/ingestion/Ingestion.ts` | `indexProject()`, `indexFile()` | `ingestion.ts` |
| `src/db/sqlite/SqliteConnection.ts` | `openDatabase()`, `closeDatabase()` | `sqliteConnection.ts` |
| `src/db/sqlite/SqliteSchema.ts` | `initializeSchema()` | `sqliteSchema.ts` |
| `src/db/sqlite/SqliteWriter.ts` | `createSqliteWriter()` | `sqliteWriter.ts` |
| `src/config/ConfigLoader.ts` | `loadConfig()`, `findConfigFile()` | `configLoader.ts` |
| `src/config/ConfigSchema.ts` | `defineConfig()` + types | `configSchema.ts` |
| `src/mcp/McpServer.ts` | `startMcpServer()` | `mcpServer.ts` |
| `src/mcp/StartServer.ts` | `main()` | `startServer.ts` |

**Alternative:** Update convention to allow module-oriented PascalCase naming (more discoverable).

---

### 20. Test Describe Blocks Use String Literals

**Impact:** Low (refactoring safety)

19 describe blocks use string literals instead of `functionName.name` pattern:

| File | Violations |
|------|------------|
| `src/config/ConfigLoader.test.ts` | 4 (lines 16, 30, 38, 69) |
| `src/config/ConfigSchema.test.ts` | 7 (lines 11, 12, 35, 67, 116, 138, 198) |
| `src/ingestion/IdGenerator.test.ts` | 2 (lines 4, 5) |
| `src/ingestion/Ingestion.test.ts` | 2 (lines 78, 92) |

**Example fix:**
```typescript
// Before
describe("indexProject", () => { ... });

// After
describe(indexProject.name, () => { ... });
```

---

### 21. Missing Module CLAUDE.md Documentation

**Impact:** Low (AI agent context)

Two modules lack required CLAUDE.md files:

1. **`src/tools/`** — Major module with 7 tool subdirectories, no documentation
2. **`src/ingestion/extract/nodes/`** — 8 node extractors, no documentation

Existing CLAUDE.md files (for reference):
- `src/config/CLAUDE.md` ✓
- `src/db/CLAUDE.md` ✓
- `src/mcp/CLAUDE.md` ✓
- `src/ingestion/CLAUDE.md` ✓
- `src/ingestion/extract/edges/CLAUDE.md` ✓

---

### Watcher Tests Missing

Watcher module lacks unit and system tests. Medium priority.

### Format Test Gaps

Format tests have good happy-path coverage but lack edge cases and negative tests. Low priority.
