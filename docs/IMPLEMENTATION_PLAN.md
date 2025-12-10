# Implementation Plan

## Project Overview

Build an MCP server that extracts TypeScript code structure into a graph database and exposes query tools for code navigation and impact analysis.

---

## Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                        MCP Server Module                         │
│  (exposes tools, calls DB Interface)                             │
└──────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────────┐
│                      DB Interface Module                         │
│  (query-agnostic: getCallers, getCallees, addNode, etc.)         │
│  (hides Cypher/SQL, abstracts storage)                           │
└──────────────────────────────────────────────────────────────────┘
           ▲                                    │
           │                                    ▼
┌──────────┴───────────┐              ┌─────────────────────┐
│  Code Ingestion      │              │  SQLite Adapter     │
│  Module              │              │  (default)          │
│  (ts-morph parsing)  │              └─────────────────────┘
└──────────────────────┘
           ▲
           │
┌──────────┴───────────┐
│  File Watcher        │
│  (chokidar)          │
└──────────────────────┘
```

---

## Key Design Decisions

| Decision | Choice |
|----------|--------|
| Project structure | Project → Modules → Packages |
| Package definition | Each package has its own tsconfig.json |
| Graph scope | One graph per project |
| Node IDs | Symbol path: `src/utils.ts:formatDate` |
| Config format | TypeScript (`ts-graph-mcp.config.ts`) |
| Storage | SQLite default, Memgraph optional |
| Watch mode | Integrated, using chokidar |
| Unindexed queries | Return empty results |
| Code style | Functional (no classes), named exports only |
| File naming | PascalCase, named after primary export (no index.ts) |
| DB abstraction | Query-agnostic interfaces |
| Watcher | Self-contained (manages own ts-morph Project) |
| Error handling | Fail-fast (no partial success) |

---

## Node & Edge Types

**Node Types (8):** Function, Class, Method, Interface, TypeAlias, Variable, File, Property

**Edge Types (8):** CALLS, IMPORTS, CONTAINS, IMPLEMENTS, EXTENDS, USES_TYPE, READS_PROPERTY, WRITES_PROPERTY

Edges have **rich metadata**: callCount, isTypeOnly, importedSymbols, context

---

## API Documentation

All interfaces documented in `docs/api/`:
- `01-shared-types.md` - Node, Edge, Path, Subgraph types
- `02-db-reader.md` - DbReader (9 methods, includes findNeighbors)
- `03-db-writer.md` - DbWriter (4 methods)
- `04-ingestion.md` - indexProject, indexFile, removeFile
- `05-watcher.md` - WatcherApi, createWatcher
- `06-config.md` - ProjectConfig, Zod schemas

---

## Implementation Phases

### Phase 1: Project Scaffold
**Files:**
- `package.json`
- `tsconfig.json`

**Dependencies:**
```json
{
  "dependencies": {
    "ts-morph": "^24.0.0",
    "better-sqlite3": "^11.0.0",
    "@modelcontextprotocol/sdk": "^1.0.0",
    "zod": "^3.0.0",
    "chokidar": "^4.0.0",
    "commander": "^12.0.0"
  },
  "devDependencies": {
    "typescript": "^5.0.0",
    "@types/node": "^22.0.0",
    "@types/better-sqlite3": "^7.0.0",
    "vitest": "^2.0.0"
  },
  "optionalDependencies": {
    "neo4j-driver": "^5.0.0"
  }
}
```

---

### Phase 2: DB Interface Module
**Files:**
- `src/db/Types.ts` - Shared types
- `src/db/DbReader.ts` - DbReader interface
- `src/db/DbWriter.ts` - DbWriter interface
- `src/db/sqlite/SqliteSchema.ts` - Table definitions
- `src/db/sqlite/SqliteConnection.ts` - DB file management
- `src/db/sqlite/SqliteWriter.ts` - DbWriter implementation
- `src/db/sqlite/SqliteReader.ts` - DbReader implementation (recursive CTEs)

**Tests:** `tests/db/integration/roundtrip.test.ts`

---

### Phase 3: Code Ingestion Module
**Files:**
- `src/ingestion/IdGenerator.ts` - Symbol path ID generation
- `src/ingestion/NodeExtractors.ts` - Extract nodes from AST
- `src/ingestion/EdgeExtractors.ts` - Extract edges from AST
- `src/ingestion/Extractor.ts` - Orchestrates extraction

**Tests:**
- `tests/fixtures/sample-project/` - Reference TS project
- `tests/ingestion/integration/extraction.test.ts`

---

### Phase 4: Config Module
**Files:**
- `src/config/ConfigSchema.ts` - Zod schemas
- `src/config/ConfigLoader.ts` - Load ts-graph-mcp.config.ts

---

### Phase 5: CLI (Index command)
**File:** `src/Cli.ts`

**Commands:**
- `index [--clear]` - Full index from config
- `stats` - Show graph statistics

---

### Phase 6: MCP Server Module
**Files:**
- `src/mcp/McpTools.ts` - Tool definitions (Zod schemas)
- `src/mcp/McpHandlers.ts` - Tool handler functions
- `src/mcp/McpServer.ts` - MCP server setup

**Tools (7):**
| Tool | Description |
|------|-------------|
| `get_callers_of` | Find what calls a function |
| `get_callees_of` | Find what a function calls |
| `get_type_usages` | Find where a type is used |
| `get_impacted_by` | Impact analysis |
| `get_path_between` | Find dependency path |
| `search_nodes` | Search by name pattern |
| `find_neighbors` | Get subgraph around a node (returns Mermaid) |

**Tests:**
- `tests/mcp/unit/handlers.test.ts`
- `tests/mcp/integration/tools.test.ts`

---

### Phase 7: File Watcher Module
**Files:**
- `src/watcher/Debounce.ts` - Debounce utility
- `src/watcher/WatcherApi.ts` - Internal API
- `src/watcher/ChokidarAdapter.ts` - Chokidar adapter

**CLI additions:**
- `watch` - Start file watcher standalone
- `serve` - MCP server with integrated watcher

**Tests:**
- `tests/watcher/unit/api.test.ts`
- `tests/watcher/system/filesystem.test.ts`

---

### Phase 8: Test Fixtures
**Files:** `tests/fixtures/sample-project/`
- Multiple modules/packages structure
- Known call relationships
- Type usages across files

---

## Directory Structure

```
ts-graph-mcp/
├── src/
│   ├── db/
│   │   ├── Types.ts
│   │   ├── SubgraphToMermaid.ts
│   │   ├── DbReader.ts
│   │   ├── DbWriter.ts
│   │   └── sqlite/
│   │       ├── SqliteConnection.ts
│   │       ├── SqliteSchema.ts
│   │       ├── SqliteReader.ts
│   │       └── SqliteWriter.ts
│   │
│   ├── ingestion/
│   │   ├── Extractor.ts
│   │   ├── NodeExtractors.ts
│   │   ├── EdgeExtractors.ts
│   │   └── IdGenerator.ts
│   │
│   ├── mcp/
│   │   ├── McpServer.ts
│   │   ├── McpTools.ts
│   │   └── McpHandlers.ts
│   │
│   ├── watcher/
│   │   ├── WatcherApi.ts
│   │   ├── ChokidarAdapter.ts
│   │   └── Debounce.ts
│   │
│   ├── config/
│   │   ├── ConfigSchema.ts
│   │   └── ConfigLoader.ts
│   │
│   └── Cli.ts
│
├── tests/
│   ├── fixtures/sample-project/
│   ├── db/
│   │   ├── unit/
│   │   │   └── SubgraphToMermaid.test.ts
│   │   └── integration/
│   │       └── roundtrip.test.ts
│   ├── ingestion/integration/
│   ├── mcp/unit/
│   ├── mcp/integration/
│   └── watcher/unit/
│
├── docs/
│   ├── api/
│   │   ├── README.md
│   │   ├── 01-shared-types.md
│   │   ├── 02-db-reader.md
│   │   ├── 03-db-writer.md
│   │   ├── 04-ingestion.md
│   │   ├── 05-watcher.md
│   │   └── 06-config.md
│   └── IMPLEMENTATION_PLAN.md
│
├── package.json
└── tsconfig.json
```

---

## Files to Create (Ordered)

### Phase 1
1. `package.json`
2. `tsconfig.json`

### Phase 2
3. `src/db/Types.ts`
4. `src/db/SubgraphToMermaid.ts`
5. `src/db/DbReader.ts`
6. `src/db/DbWriter.ts`
7. `src/db/sqlite/SqliteSchema.ts`
8. `src/db/sqlite/SqliteConnection.ts`
9. `src/db/sqlite/SqliteWriter.ts`
10. `src/db/sqlite/SqliteReader.ts`
11. `tests/db/unit/SubgraphToMermaid.test.ts`
12. `tests/db/integration/roundtrip.test.ts`

### Phase 3
11. `src/ingestion/IdGenerator.ts`
12. `src/ingestion/NodeExtractors.ts`
13. `src/ingestion/EdgeExtractors.ts`
14. `src/ingestion/Extractor.ts`
15. `tests/fixtures/sample-project/`
16. `tests/ingestion/integration/extraction.test.ts`

### Phase 4
17. `src/config/ConfigSchema.ts`
18. `src/config/ConfigLoader.ts`

### Phase 5
19. `src/Cli.ts`

### Phase 6
20. `src/mcp/McpTools.ts`
21. `src/mcp/McpHandlers.ts`
22. `src/mcp/McpServer.ts`
23. `tests/mcp/unit/handlers.test.ts`
24. `tests/mcp/integration/tools.test.ts`

### Phase 7
25. `src/watcher/Debounce.ts`
26. `src/watcher/WatcherApi.ts`
27. `src/watcher/ChokidarAdapter.ts`
28. `tests/watcher/unit/api.test.ts`
29. `tests/watcher/system/filesystem.test.ts`

---

## Testing Strategy

| Module | Test Type | Description |
|--------|-----------|-------------|
| DB Interface | Integration | Write then read roundtrip |
| Ingestion | Integration | Mock DbWriter, verify nodes/edges |
| SubgraphToMermaid | Unit | Mermaid conversion, node formatting, edge labels |
| MCP Server | Unit | Mock DbReader, verify handlers |
| MCP Server | Integration | Seeded DB, verify output |
| Watcher | Unit | Mock ingestion, verify API |
| Watcher | System | Real filesystem changes |

---

## Current Progress

- [x] API documentation complete (`docs/api/`)
- [ ] Phase 1: Project scaffold
- [ ] Phase 2: DB Interface Module
- [ ] Phase 3: Code Ingestion Module
- [ ] Phase 4: Config Module
- [ ] Phase 5: CLI
- [ ] Phase 6: MCP Server Module
- [ ] Phase 7: File Watcher Module
- [ ] Phase 8: Test fixtures
