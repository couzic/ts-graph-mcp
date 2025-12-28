# ts-graph-mcp

A Model Context Protocol (MCP) server that extracts TypeScript code structure into a queryable graph database, enabling AI coding agents to explore and navigate codebases through structural relationships.

## What It Does

ts-graph-mcp parses TypeScript source code using AST analysis and builds a graph database of your codebase structure. The graph captures code symbols (functions, classes, interfaces, types, variables) and their relationships (calls, imports, type usage, inheritance).

AI agents can then query this graph through 6 specialized MCP tools to:

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

Create a `ts-graph-mcp.config.ts` file in your project root:

```typescript
import { defineConfig } from 'ts-graph-mcp';

export default defineConfig({
  modules: [
    {
      name: "core",
      packages: [
        { name: "main", tsconfig: "./tsconfig.json" }
      ]
    }
  ]
});
```

Alternatively, use `ts-graph-mcp.config.js` or `ts-graph-mcp.config.json`.

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

### Required Fields

**`modules`** - Array of module definitions:

- `name` (string): Module identifier
- `packages` (array): Package configurations
  - `name` (string): Package identifier
  - `tsconfig` (string): Path to tsconfig.json

### Optional Fields

**`storage`** - Database configuration:

- `type`: `"sqlite"` (default)
- `path`: Database file path (default: `.ts-graph-mcp/graph.db`)

**`watch`** - File watching configuration:

- `include`: Glob patterns for files to watch
- `exclude`: Glob patterns for files to ignore
- `debounce`: Milliseconds to wait before re-indexing

### Full Example

```typescript
import { defineConfig } from 'ts-graph-mcp';

export default defineConfig({
  modules: [
    {
      name: "core",
      packages: [
        { name: "domain", tsconfig: "./packages/domain/tsconfig.json" },
        { name: "utils", tsconfig: "./packages/utils/tsconfig.json" }
      ]
    },
    {
      name: "api",
      packages: [
        { name: "server", tsconfig: "./apps/api/tsconfig.json" }
      ]
    }
  ],
  storage: {
    type: "sqlite",
    path: ".ts-graph-mcp/graph.db"
  },
  watch: {
    include: ["src/**/*.ts"],
    exclude: ["**/*.test.ts", "**/*.spec.ts"],
    debounce: 300
  }
});
```

## MCP Tools

The server exposes 6 tools for querying the code graph:

| Tool | Purpose | Key Parameters |
|------|---------|----------------|
| `incomingCallsDeep` | Find all functions/methods that call the target (transitive) | `symbol`, `file?`, `module?`, `package?`, `maxDepth?` |
| `outgoingCallsDeep` | Find all functions/methods that the source calls (transitive) | `symbol`, `file?`, `module?`, `package?`, `maxDepth?` |
| `incomingPackageDeps` | Find reverse package dependencies | `package`, `module?`, `maxDepth?`, `outputTypes?` |
| `outgoingPackageDeps` | Find package dependencies | `package`, `module?`, `maxDepth?`, `outputTypes?` |
| `analyzeImpact` | Impact analysis - find all code affected by changes | `symbol`, `file?`, `module?`, `package?`, `maxDepth?` |
| `findPaths` | Find shortest path between two symbols | `from: {symbol, ...}`, `to: {symbol, ...}`, `maxDepth?`, `maxPaths?` |

### Symbol-Based Queries

All tools use a **SymbolQuery pattern** for inputs:

- **Required**: `symbol` - Symbol name (e.g., `"formatDate"`, `"User.save"`)
- **Optional filters**: `file`, `module`, `package` - Narrow scope when symbol name is ambiguous

If multiple symbols match, the tool returns candidates with their location details, allowing you to refine your query with additional filters.

### Example Outputs

All outputs include `offset` and `limit` fields that can be passed directly to the Read tool.

#### incomingCallsDeep

Find all callers of `saveUser`:

```bash
# Input
{ symbol: "saveUser" }

# Output
target: saveUser (Function)
file: src/db/user.ts
offset: 15, limit: 8
count: 2

src/api/handler.ts (1 callers):
functions[1]:
  handleRequest async (req:Request) → Promise<Response>
    offset: 9, limit: 17
    callCount: 1, depth: 1

src/services/UserService.ts (1 callers):
methods[1]:
  UserService.create async (data:UserData) → Promise<User>
    offset: 19, limit: 12
    callCount: 2, depth: 1
```

#### findPaths

Find path from `handleRequest` to `saveData`:

```bash
# Input
{ from: { symbol: "handleRequest" }, to: { symbol: "saveData" } }

# Output
from: handleRequest (Function) in src/api.ts
to: saveData (Function) in src/db.ts
found: 1 path
length: 3

path[1]:
  handleRequest (src/api.ts)
    --CALLS-->
  process (src/service.ts)
    --CALLS-->
  saveData (src/db.ts)
```

### Supported Node Types

Function, Class, Method, Interface, TypeAlias, Variable, File, Property

### Supported Edge Types

CALLS, IMPORTS, CONTAINS, IMPLEMENTS, EXTENDS, USES_TYPE, READS_PROPERTY, WRITES_PROPERTY

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
npm run benchmark:quick   # Quick benchmark run
npm run benchmark         # Full benchmark suite
```

#### Claude CLI Configuration

The benchmark runner spawns the `claude` CLI. By default, it uses `npx @anthropic-ai/claude-code` which works but is slower (~500ms startup).

For faster runs, set `CLAUDE_PATH` to your Claude installation:

```bash
# Find your claude path
type claude  # e.g., "claude is aliased to '/home/user/.claude/local/claude'"

# Run with explicit path (faster)
CLAUDE_PATH=/home/user/.claude/local/claude npm run benchmark:quick
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
