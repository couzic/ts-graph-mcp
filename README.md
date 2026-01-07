# ts-graph-mcp

A TypeScript code graph tool that extracts code structure into a queryable database, with MCP integration for AI coding agents.

## What It Does

ts-graph parses TypeScript source code using AST analysis and builds a graph database of your codebase structure. The graph captures code symbols (functions, classes, interfaces, types, variables) and their relationships (calls, imports, type usage, inheritance).

AI agents can query the graph through 3 MCP tools to:

- Traverse call graphs (who calls this? what does this call?)
- Analyze code impact (what breaks if I change this?)
- Find paths between symbols

## Quick Start

### 1. Configuration

Create `ts-graph-mcp.config.json` in your project root:

```json
{
  "packages": [
    { "name": "main", "tsconfig": "./tsconfig.json" }
  ],
  "server": {
    "port": 4000
  }
}
```

For monorepos, list multiple packages:

```json
{
  "packages": [
    { "name": "shared", "tsconfig": "./shared/tsconfig.json" },
    { "name": "frontend", "tsconfig": "./frontend/tsconfig.json" },
    { "name": "backend", "tsconfig": "./backend/tsconfig.json" }
  ],
  "server": {
    "port": 4000
  }
}
```

### 2. Start the HTTP Server

```bash
npx ts-graph-mcp
```

The server indexes your project on first run and watches for changes.

### 3. Configure Claude Code

```bash
claude mcp add ts-graph-mcp -- npx -y ts-graph-mcp --mcp
```

Or manually in `.mcp.json`:

```json
{
  "mcpServers": {
    "ts-graph-mcp": {
      "command": "npx",
      "args": ["-y", "ts-graph-mcp", "--mcp"]
    }
  }
}
```

**Note:** Start the HTTP server first. The MCP wrapper connects to it.

## MCP Tools

All tools use `file_path` and `symbol` to reference code elements.

### dependenciesOf

Find all code that a symbol depends on (forward dependencies).

```typescript
// What does handleRequest call?
{ file_path: "src/api.ts", symbol: "handleRequest" }
```

### dependentsOf

Find all code that depends on a symbol (reverse dependencies).

```typescript
// Who calls saveUser?
{ file_path: "src/db/user.ts", symbol: "saveUser" }
```

### pathsBetween

Find how two symbols connect through the code graph.

```typescript
// How does handleRequest reach saveData?
{
  from: { file_path: "src/api.ts", symbol: "handleRequest" },
  to: { file_path: "src/db.ts", symbol: "saveData" }
}
```

### Example Output

```
## Graph

handleRequest --CALLS--> validate --CALLS--> saveUser

## Nodes

validate:
  file: src/service.ts
  offset: 10, limit: 5
  snippet:
    10: export function validate(data: Input) {
  > 11:   return saveUser(data);
    12: }

saveUser:
  file: src/db/user.ts
  offset: 3, limit: 4
  snippet:
    3: export function saveUser(data: Input) {
    4:   return db.insert(data);
    5: }
```

## CLI Options

```bash
ts-graph-mcp              # Start HTTP server
ts-graph-mcp --mcp        # Start MCP stdio server
ts-graph-mcp --reindex    # Force clean reindex
```

## Configuration Reference

### Required

| Field | Description |
|-------|-------------|
| `packages` | Array of `{ name, tsconfig }` |
| `server.port` | HTTP server port (no default) |

### Optional

| Field | Description | Default |
|-------|-------------|---------|
| `storage.type` | Database type | `"sqlite"` |
| `storage.path` | Database file path | `.ts-graph-mcp/graph.db` |
| `watch.debounce` | Enable debouncing | `true` |
| `watch.debounceInterval` | Debounce delay (ms) | `300` |
| `watch.polling` | Use polling (for Docker/WSL2) | `false` |
| `watch.pollingInterval` | Polling interval (ms) | `1000` |
| `watch.excludeDirectories` | Directories to skip | `[]` |
| `watch.silent` | Suppress reindex logs | `false` |

Add `.ts-graph-mcp/` to your `.gitignore`.

### Yarn PnP Support

ts-graph works with Yarn 4 PnP monorepos. When `.pnp.cjs` is detected, module resolution uses Yarn's PnP API.

Requirements:
- Use base package imports (`@libs/utils`, not `@libs/utils/date`)
- Declare dependencies with `workspace:*` protocol

## Supported Types

**Nodes:** Function, Class, Method, Interface, TypeAlias, Variable, File, Property

**Edges:** CALLS, IMPORTS, CONTAINS, IMPLEMENTS, EXTENDS, USES_TYPE, REFERENCES, INCLUDES

## Development

```bash
npm run check        # Run tests, build, and lint
npm test             # Run tests
npm run build        # Compile TypeScript
```

### Project Structure

```
ts-graph-mcp/
├── http/          # HTTP server, database, ingestion, queries
├── mcp/           # MCP stdio wrapper
├── shared/        # Shared types
├── ui/            # Web UI (React + Vite)
└── main.ts        # Entry point
```

## Windows Users

This package uses `better-sqlite3`, which requires compilation tools:

1. Install [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) with "Desktop development with C++"
2. Install Python 3.x
3. Use Node.js LTS

## Contributing

See [ARCHITECTURE.md](ARCHITECTURE.md) for technical internals and [CLAUDE.md](CLAUDE.md) for code style guidelines.

## License

MIT
