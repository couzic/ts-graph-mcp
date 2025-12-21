# MCP Module

## Purpose

Exposes the TypeScript code graph as an MCP (Model Context Protocol) server that provides 14 tools for AI coding agents to query and explore code structure. This is the primary interface for the ts-graph-mcp project.

**For tool documentation, see [`../tools/CLAUDE.md`](../tools/CLAUDE.md).**

## Architecture: Vertical Slices

Each tool is implemented as a self-contained vertical slice in `src/tools/<tool-name>/`:

```
src/tools/
├── incoming-calls-deep/    ├── incoming-imports/     ├── incoming-extends/
├── outgoing-calls-deep/    ├── outgoing-imports/     ├── outgoing-extends/
├── analyze-impact/         ├── incoming-uses-type/   ├── incoming-implements/
├── find-path/              ├── outgoing-uses-type/   ├── outgoing-implements/
├── incoming-package-deps/  └── outgoing-package-deps/
└── shared/                 (SymbolQuery.ts, resolveSymbol.ts, nodeFormatters.ts)
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

Initializes and starts the MCP server on stdio transport with 14 registered tools. Dispatches tool calls to vertical slice handlers. See [`../tools/CLAUDE.md`](../tools/CLAUDE.md) for tool details.

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
# incomingCallsDeep example
target: saveUser (Function)
file: src/db/user.ts
offset: 15, limit: 8
count: 2

src/api/handler.ts (1 callers):
functions[1]:
  handleRequest async (req:Request) → Promise<Response>
    offset: 9, limit: 17
    callCount: 1, depth: 1
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
