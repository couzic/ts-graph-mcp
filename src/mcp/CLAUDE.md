# MCP Module

## Purpose

Exposes the TypeScript code graph as an MCP (Model Context Protocol) server that provides 7 tools for AI coding agents to query and explore code structure. This is the primary interface for the ts-graph-mcp project.

## Key Exports

### `startMcpServer(reader: DbReader): Promise<void>`
**File:** `McpServer.ts`

Initializes and starts the MCP server on stdio transport with 7 registered tools. Uses functional style with inline tool registration. All tool responses are JSON-formatted, with Mermaid diagrams for visual subgraphs.

**Tools provided:**
1. `search_nodes` - Search by name pattern with filters (type, module, package, exported)
2. `get_callers` - Find all callers of a function/method (supports transitive traversal)
3. `get_callees` - Find all callees of a function/method (supports transitive traversal)
4. `get_impact` - Impact analysis - all code affected by changes to a node
5. `find_path` - Find shortest path between two nodes (BFS)
6. `get_neighbors` - Find all nodes within N edges (with direction control)
7. `get_file_symbols` - Get all symbols defined in a file

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
- **Response format:** JSON + Mermaid diagrams for subgraphs
- **Error handling:** All tool errors caught and returned as MCP error responses
- **Validation:** Zod schemas validate all tool inputs before execution

### Database Initialization
- Default database path: `.ts-graph/graph.db`
- If database doesn't exist on startup, attempts to auto-index using config file
- Falls back to empty database if no config found
- Uses `:memory:` for in-memory database (pass `--db :memory:`)

### Tool Response Patterns
Each tool follows consistent response patterns:
- **Node lists:** `{ count: number, nodes: Node[] }`
- **Paths:** `{ found: boolean, path?: {...}, message?: string }`
- **Subgraphs:** `{ center: Node, nodeCount: number, edgeCount: number, nodes: Node[], edges: Edge[] }` + Mermaid diagram

### Dependencies
- Requires `DbReader` interface (from `../db/DbReader.ts`)
- Uses `@modelcontextprotocol/sdk` for MCP server implementation
- All graph traversal is delegated to the reader implementation (typically `SqliteReader`)

## Integration Points

### Starting the server
```typescript
import { createSqliteReader } from "../db/sqlite/SqliteReader.js";
import { openDatabase } from "../db/sqlite/SqliteConnection.js";
import { startMcpServer } from "./McpServer.js";

const db = openDatabase({ path: "./graph.db" });
const reader = createSqliteReader(db);
await startMcpServer(reader);
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
- **Node IDs:** All tools expect node IDs in format `{relativePath}:{symbolPath}` (e.g., `src/utils.ts:formatDate`)
- **Auto-indexing:** Only happens on first run when database doesn't exist
- **No file watching:** Server doesn't auto-refresh on code changes (use external tooling or restart server)
- **Tool execution:** All tools are read-only - no mutations to the code graph via MCP interface
