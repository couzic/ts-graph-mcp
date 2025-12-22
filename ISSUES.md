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

### Watcher Tests Missing

Watcher module lacks unit and system tests. Medium priority.

### Format Test Gaps

Format tests have good happy-path coverage but lack edge cases and negative tests. Low priority.
