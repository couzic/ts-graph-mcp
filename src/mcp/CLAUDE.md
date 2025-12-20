# MCP Module

## Purpose

Exposes the TypeScript code graph as an MCP (Model Context Protocol) server that provides 6 tools for AI coding agents to query and explore code structure. This is the primary interface for the ts-graph-mcp project.

## Architecture: Vertical Slices

Each tool is implemented as a self-contained vertical slice:

```
src/tools/
├── search/          (query.ts, format.ts, format.test.ts, handler.ts)
├── get-callers/     (query.ts, format.ts, format.test.ts, handler.ts)
├── get-callees/     (query.ts, format.ts, format.test.ts, handler.ts)
├── get-impact/      (query.ts, format.ts, format.test.ts, handler.ts)
├── find-path/       (query.ts, format.ts, format.test.ts, handler.ts)
├── get-neighbors/   (query.ts, format.ts, format.test.ts, handler.ts)
└── shared/          (SymbolQuery.ts, resolveSymbol.ts, resolveSymbol.test.ts)
```

**Each slice contains:**
- `handler.ts` - Tool definition and execution entry point
- `query.ts` - Direct SQL queries (no shared abstraction)
- `format.ts` - Hierarchical text output formatting
- `format.test.ts` - Unit tests for formatting

**Shared utilities:**
- `SymbolQuery.ts` - Type definitions for symbol queries with optional filters
- `resolveSymbol.ts` - Resolves symbol names to node IDs using file/module/package filters

## Key Exports

### `startMcpServer(db: Database.Database): Promise<void>`
**File:** `McpServer.ts`

Initializes and starts the MCP server on stdio transport with 6 registered tools. Dispatches tool calls to vertical slice handlers.

**Tools provided:**
1. `search` - Search symbols by name pattern with filters (type, module, package, exported) and pagination (offset, limit)
2. `get_callers` - Find all callers of a symbol (supports transitive traversal via maxDepth)
3. `get_callees` - Find all callees of a symbol (supports transitive traversal via maxDepth)
4. `get_impact` - Impact analysis - all code affected by changes to a symbol
5. `find_path` - Find shortest path between two symbols (BFS with maxDepth, maxPaths)
6. `get_neighbors` - Find all nodes within N edges of a symbol (with direction control, Mermaid output)

### `main(): Promise<void>`
**File:** `StartServer.ts`

CLI entry point that orchestrates database initialization and server startup. Handles:
- Command-line argument parsing (`--db` flag for database path)
- Auto-indexing if database doesn't exist (looks for config file)
- Database connection management
- Error handling and logging to stderr

## Critical Information

### Server Architecture
- **Transport:** Stdio only (designed for MCP protocol)
- **Response format:** Hierarchical text output (~60-70% token reduction vs JSON)
- **Error handling:** All tool errors caught and returned as MCP error responses
- **Database access:** Direct SQL via better-sqlite3 (no shared DbReader abstraction)

### Database Initialization
- Default database path: `.ts-graph/graph.db`
- If database doesn't exist on startup, attempts to auto-index using config file
- Falls back to empty database if no config found
- Uses `:memory:` for in-memory database (pass `--db :memory:`)

### Tool Response Format

All tools return hierarchical text optimized for LLM consumption:

```
# search example (with pagination)
search: User*
count: 3
showing: 3 (offset: 0, limit: 100)
files: 2

file: src/types.ts
  module: core
  package: main
  matches: 2
  interfaces[1]:
    User [1-10] exp
  typeAliases[1]:
    UserId [12] exp = string

file: src/models/User.ts
  module: models
  package: main
  matches: 1
  classes[1]:
    UserService [5-50] exp
```

### Dependencies
- Uses `better-sqlite3` for direct database queries
- Uses `@modelcontextprotocol/sdk` for MCP server implementation
- Graph traversals implemented via recursive CTEs in each tool's `query.ts`

## Integration Points

### Starting the server
```typescript
import { openDatabase } from "../db/sqlite/SqliteConnection.js";
import { startMcpServer } from "./McpServer.js";

const db = openDatabase({ path: "./graph.db" });
await startMcpServer(db);
```

### CLI usage
```bash
# Use default database path (.ts-graph/graph.db)
ts-graph-mcp

# Use custom database path
ts-graph-mcp --db /path/to/graph.db

# Use in-memory database
ts-graph-mcp --db :memory:
```

## Important Notes

- **Logging:** All logs go to stderr to avoid interfering with stdio transport
- **Symbol queries:** All tools accept symbol names with optional filters (file, module, package) instead of raw node IDs. The `resolveSymbol()` utility handles ambiguity resolution and provides clear error messages when symbols don't exist or match multiple nodes.
- **Auto-indexing:** Only happens on first run when database doesn't exist
- **No file watching:** Server doesn't auto-refresh on code changes (use external tooling or restart server)
- **Tool execution:** All tools are read-only - no mutations to the code graph via MCP interface
- **Pagination:** The `search` tool supports offset/limit parameters for handling large result sets efficiently
