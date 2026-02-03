# ts-graph-mcp

A TypeScript code graph tool that extracts code structure into a queryable
database, with MCP integration for AI coding agents.

## What It Does

ts-graph parses TypeScript source code using AST analysis and builds a graph
database of your codebase structure. The graph captures code symbols (functions,
classes, interfaces, types, variables) and their relationships (calls, imports,
type usage, inheritance).

**Semantic search included.** On first run, ts-graph downloads an embedding
model (~300MB) and generates embeddings for all symbols. AI agents can search by
concept ("user validation", "database queries") not just exact symbol names.

AI agents query the graph through the `searchGraph` MCP tool to:

- Find code by concept (semantic search)
- Traverse call graphs (who calls this? what does this call?)
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

## MCP Tool: searchGraph

Unified search combining semantic search with graph traversal.

### Query Patterns

```typescript
// Find code by concept (semantic search)
{ topic: "user authentication" }

// What does handleRequest call? (forward traversal)
{ from: { symbol: "handleRequest" } }

// Who calls saveUser? (backward traversal)
{ to: { symbol: "saveUser" } }

// How does A reach B? (path finding)
{ from: { symbol: "handleRequest" }, to: { symbol: "saveUser" } }

// Semantic endpoint resolution
{ from: { query: "user input handling" }, to: { symbol: "Database.save" } }
```

### Parameters

| Parameter   | Required | Description                                                        |
| ----------- | -------- | ------------------------------------------------------------------ |
| `topic`     | No*      | Semantic search for a concept (standalone mode)                    |
| `from`      | No*      | Start point: `{ symbol }` or `{ query }` with optional `file_path` |
| `to`        | No*      | End point: `{ symbol }` or `{ query }` with optional `file_path`   |
| `max_nodes` | No       | Output limit (default: 50)                                         |

*At least one of `topic`, `from`, or `to` is required. Currently `topic` only
works in standalone mode — it is not combined with `from`/`to` traversals.

### Example Output

```
## Symbols matching "validation" (semantic search)

validateInput (Function) - src/validation.ts [score: 0.847]
checkUserData (Function) - src/user.ts [score: 0.721]
```

```
## Graph

handleRequest --CALLS--> validate --CALLS--> saveUser

## Nodes

validate:
  type: Function
  file: src/service.ts
  offset: 10, limit: 5
  snippet:
    10: export function validate(data: Input) {
  > 11:   return saveUser(data);
    12: }
```

## CLI Options

```bash
ts-graph-mcp              # Start HTTP server
ts-graph-mcp --mcp        # Start MCP stdio server
ts-graph-mcp --reindex    # Force clean reindex
```

## Configuration Reference

### Required

| Field         | Description                   |
| ------------- | ----------------------------- |
| `packages`    | Array of `{ name, tsconfig }` |
| `server.port` | HTTP server port (no default) |

### Optional

| Field                      | Description                   | Default                   |
| -------------------------- | ----------------------------- | ------------------------- |
| `embedding.preset`         | Embedding model               | `"nomic-embed-text-v1.5"` |
| `storage.type`             | Database type                 | `"sqlite"`                |
| `storage.path`             | Database file path            | `.ts-graph-mcp/graph.db`  |
| `watch.debounce`           | Enable debouncing             | `true`                    |
| `watch.debounceInterval`   | Debounce delay (ms)           | `300`                     |
| `watch.polling`            | Use polling (for Docker/WSL2) | `false`                   |
| `watch.pollingInterval`    | Polling interval (ms)         | `1000`                    |
| `watch.excludeDirectories` | Directories to skip           | `[]`                      |
| `watch.silent`             | Suppress reindex logs         | `false`                   |

### Embedding Models

| Preset                         | Size   | Dimensions | Notes                           |
| ------------------------------ | ------ | ---------- | ------------------------------- |
| `nomic-embed-text-v1.5`        | ~300MB | 768        | Default, fast and effective     |
| `qwen3-0.6b`                   | ~650MB | 1024       | Higher quality, slower          |
| `qwen3-4b`                     | ~4GB   | 2560       | Highest quality, needs more RAM |
| `jina-embeddings-v2-base-code` | ~300MB | 768        | Optimized for code              |

Add `.ts-graph-mcp/` to your `.gitignore`.

### Yarn PnP Support

ts-graph works with Yarn 4 PnP monorepos. When `.pnp.cjs` is detected, module
resolution uses Yarn's PnP API.

Requirements:

- Use base package imports (`@libs/utils`, not `@libs/utils/date`)
- Declare dependencies with `workspace:*` protocol

## Supported Types

**Nodes:** Function, Class, Method, Interface, TypeAlias, Variable, Property

**Edges:** CALLS, IMPLEMENTS, EXTENDS, USES_TYPE, REFERENCES, INCLUDES

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

1. Install
   [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/)
   with "Desktop development with C++"
2. Install Python 3.x
3. Use Node.js LTS

## Contributing

See [ARCHITECTURE.md](ARCHITECTURE.md) for technical internals and
[CLAUDE.md](CLAUDE.md) for code style guidelines.

## License

MIT
