# ts-graph-mcp

A Model Context Protocol (MCP) server that extracts TypeScript code structure into a queryable graph database, enabling AI coding agents to explore and navigate codebases through structural relationships.

## What It Does

ts-graph-mcp parses TypeScript source code using AST analysis and builds a graph database of your codebase structure. The graph captures code symbols (functions, classes, interfaces, types, variables) and their relationships (calls, imports, type usage, inheritance).

AI agents can then query this graph through 3 specialized MCP tools to:

- Traverse call graphs (who calls this? what does this call?)
- Analyze code impact (what breaks if I change this?)
- Find paths between symbols
- Extract neighborhood subgraphs with visual diagrams

All tools use a **symbol-based query pattern** - reference code elements by name with optional filters (`file`, `module`, `package`) for disambiguation. Tool outputs are machine-readable and include `offset` and `limit` fields that integrate directly with the Read tool without computation.

Responses use a hierarchical text format optimized for LLM consumption, achieving approximately 60-70% token reduction compared to JSON.

## Quick Start

### Installation

```bash
npm install ts-graph-mcp
```

Requires Node.js >= 18.0.0

#### Windows Users

This package uses `better-sqlite3`, a native addon that requires compilation tools. If you see errors like `"No prebuilt binaries found"` or `"Could not find any Visual Studio installation"`:

1. Install [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) with the "Desktop development with C++" workload
2. Install Python (3.x)
3. Use an LTS version of Node.js (prebuilt binaries are only published for LTS releases)

### Configuration

Create a `ts-graph-mcp.config.json` file in your project root.

**Single package** — skip config entirely if `tsconfig.json` exists (auto-detected):

```json
{
  "packages": [
    { "name": "main", "tsconfig": "./tsconfig.json" }
  ]
}
```

**Multiple packages** — use the flat `packages` array:

```json
{
  "packages": [
    { "name": "shared", "tsconfig": "./shared/tsconfig.json" },
    { "name": "frontend", "tsconfig": "./frontend/tsconfig.json" },
    { "name": "backend", "tsconfig": "./backend/tsconfig.json" }
  ]
}
```

**Monorepo with modules** — group packages into logical modules:

```json
{
  "modules": [
    {
      "name": "core",
      "packages": [
        { "name": "domain", "tsconfig": "./packages/domain/tsconfig.json" },
        { "name": "utils", "tsconfig": "./packages/utils/tsconfig.json" }
      ]
    }
  ]
}
```

### Running the Server

```bash
npx ts-graph-mcp
```

The server runs via stdio transport (standard MCP protocol). On first run, it automatically indexes your project if the database doesn't exist.

### Claude Code Setup

```bash
claude mcp add ts-graph -- npx -y ts-graph-mcp
```

Or manually in `.mcp.json`:

```json
{
  "mcpServers": {
    "ts-graph": {
      "command": "npx",
      "args": ["-y", "ts-graph-mcp"]
    }
  }
}
```

## Configuration Reference

Two formats are supported — use whichever fits your project structure.

### Flat Format (packages only)

**`packages`** - Array of package definitions (creates an implicit "main" module):

- `name` (string): Package identifier
- `tsconfig` (string): Path to tsconfig.json

### Full Format (modules with packages)

**`modules`** - Array of module definitions:

- `name` (string): Module identifier
- `packages` (array): Package configurations
  - `name` (string): Package identifier
  - `tsconfig` (string): Path to tsconfig.json

### Optional Fields

**`storage`** - Database configuration:

- `type`: `"sqlite"` (default)
- `path`: Database file path (default: `node_modules/.cache/ts-graph-mcp/graph.db`)

**`watch`** - File watching configuration:

- `debounce`: Milliseconds to wait before re-indexing (default: 300)
- `usePolling`: Use polling instead of native events (for Docker/WSL2/NFS)
- `pollingInterval`: Polling interval in ms (default: 1000)
- `silent`: Suppress reindex log messages

**`server`** - HTTP server configuration:

- `port`: Server port (default: auto-find available port)
- `host`: Bind address (default: `127.0.0.1`)

### Examples

**Flat format** — multiple packages, single implicit module:

```json
{
  "packages": [
    { "name": "shared", "tsconfig": "./shared/tsconfig.json" },
    { "name": "frontend", "tsconfig": "./frontend/tsconfig.json" },
    { "name": "backend", "tsconfig": "./backend/tsconfig.json" }
  ],
  "watch": {
    "debounce": 300
  }
}
```

**Full format** — monorepo with multiple modules:

```json
{
  "modules": [
    {
      "name": "core",
      "packages": [
        { "name": "domain", "tsconfig": "./packages/domain/tsconfig.json" },
        { "name": "utils", "tsconfig": "./packages/utils/tsconfig.json" }
      ]
    },
    {
      "name": "api",
      "packages": [
        { "name": "server", "tsconfig": "./apps/api/tsconfig.json" }
      ]
    }
  ],
  "storage": {
    "type": "sqlite",
    "path": "node_modules/.cache/ts-graph-mcp/graph.db"
  }
}
```

### Yarn PnP Support

ts-graph-mcp works with **Yarn 4 Plug'n'Play (PnP)** monorepos. When a `.pnp.cjs` file is detected, module resolution automatically uses Yarn's PnP API instead of filesystem lookups.

**Requirements for PnP projects:**

1. Use **base package imports** (not subpaths):
   ```typescript
   // ✅ Works
   import { formatDate } from "@libs/utils";

   // ❌ Requires exports field in package.json
   import { formatDate } from "@libs/utils/date";
   ```

2. Declare all dependencies in `package.json` with `workspace:*`:
   ```json
   {
     "dependencies": {
       "@libs/utils": "workspace:*"
     }
   }
   ```

No tsconfig `paths` configuration needed — PnP handles cross-package resolution.

## MCP Tools

The server exposes 3 tools for querying the code graph:

| Tool | Purpose | Key Parameters |
|------|---------|----------------|
| `dependenciesOf` | Find all code that a symbol depends on (forward dependencies) | `file_path`, `symbol` |
| `dependentsOf` | Find all code that depends on a symbol (reverse dependencies) | `file_path`, `symbol` |
| `pathsBetween` | Find how two symbols connect through the code graph | `from: {file_path, symbol}`, `to: {file_path, symbol}` |

### Symbol-Based Queries

All tools require two parameters:

- **`file_path`**: Path to the file containing the symbol (e.g., `"src/utils.ts"`)
- **`symbol`**: Symbol name (e.g., `"formatDate"`, `"User.save"`)

### Example Outputs

All outputs include `offset` and `limit` fields that can be passed directly to the Read tool.

#### dependentsOf

Find all code that depends on `saveUser`:

```bash
# Input
{ file_path: "src/db/user.ts", symbol: "saveUser" }

# Output
Graph:
saveUser (src/db/user.ts)
├── handleRequest (src/api/handler.ts)
│   └── ...
└── UserService.create (src/services/UserService.ts)

Nodes:
saveUser (Function) src/db/user.ts
  offset: 15, limit: 8
handleRequest (Function) src/api/handler.ts
  offset: 9, limit: 17
UserService.create (Method) src/services/UserService.ts
  offset: 19, limit: 12
```

#### pathsBetween

Find path from `handleRequest` to `saveData`:

```bash
# Input
{ from: { file_path: "src/api.ts", symbol: "handleRequest" }, to: { file_path: "src/db.ts", symbol: "saveData" } }

# Output
Paths[1]:
handleRequest --CALLS--> process --CALLS--> saveData

Nodes:
handleRequest (Function) src/api.ts
  offset: 5, limit: 12
process (Function) src/service.ts
  offset: 10, limit: 8
saveData (Function) src/db.ts
  offset: 3, limit: 6
```

### Supported Node Types

Function, Class, Method, Interface, TypeAlias, Variable, File, Property

### Supported Edge Types

CALLS, IMPORTS, CONTAINS, IMPLEMENTS, EXTENDS, USES_TYPE, REFERENCES

## Development

### Scripts

```bash
npm run check        # Run tests, build, and lint (always use before committing)
npm run build        # Compile TypeScript to dist/
npm test             # Run tests once
npm run test:watch   # Run tests in watch mode
npm run dev          # TypeScript compiler in watch mode
npm run lint         # Check code with Biome
npm run lint:fix     # Auto-fix linting issues
```

### Benchmarks

Run benchmarks to test MCP tool performance:

```bash
npm run benchmark:call-chain   # Benchmark call-chain sample project
npm run benchmark:layered-api  # Benchmark layered-api sample project
npm run benchmark:monorepo     # Benchmark monorepo sample project
npm run benchmark:all          # Run all benchmarks
```

#### Claude CLI Configuration

The benchmark runner spawns the `claude` CLI. By default, it uses `npx @anthropic-ai/claude-code` which works but is slower (~500ms startup).

For faster runs, set `CLAUDE_PATH` to your Claude installation:

```bash
# Find your claude path
type claude  # e.g., "claude is aliased to '/home/user/.claude/local/claude'"

# Run with explicit path (faster)
CLAUDE_PATH=/home/user/.claude/local/claude npm run benchmark:call-chain
```

Or add to your shell profile:

```bash
export CLAUDE_PATH=/home/user/.claude/local/claude
```

### Project Structure

```
src/
├── config/      # Configuration loading and validation
├── db/          # Database layer (SQLite implementation)
├── ingestion/   # TypeScript AST parsing and graph extraction
├── mcp/         # MCP server entry point and protocol handling
└── tools/       # MCP tool handlers
```

### Architecture

Each tool has its own folder with handler and query logic. Shared formatting code lives in `src/tools/shared/`. See [ARCHITECTURE.md](ARCHITECTURE.md) for details.

### Code Style

- Functional programming (no classes)
- Named exports only (no default exports)
- File naming matches primary export casing
- Tests colocated with implementation

## License

MIT
