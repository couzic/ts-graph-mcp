# ts-graph-mcp

A Model Context Protocol (MCP) server that extracts TypeScript code structure into a queryable graph database, enabling AI coding agents to explore and navigate codebases through structural relationships.

## What It Does

ts-graph-mcp parses TypeScript source code using AST analysis and builds a graph database of your codebase structure. The graph captures code symbols (functions, classes, interfaces, types, variables) and their relationships (calls, imports, type usage, inheritance).

AI agents can then query this graph through 6 specialized MCP tools to:

- Search for symbols by name patterns
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
| `searchSymbols` | Search for symbols by name pattern | `pattern` (glob), `type`, `module`, `package`, `exported` |
| `incomingCallsDeep` | Find all functions/methods that call the target (transitive) | `symbol`, `file?`, `module?`, `package?`, `maxDepth?` |
| `outgoingCallsDeep` | Find all functions/methods that the source calls (transitive) | `symbol`, `file?`, `module?`, `package?`, `maxDepth?` |
| `analyzeImpact` | Impact analysis - find all code affected by changes | `symbol`, `file?`, `module?`, `package?`, `maxDepth?` |
| `findPath` | Find shortest path between two symbols | `from: {symbol, ...}`, `to: {symbol, ...}`, `maxDepth?`, `maxPaths?` |
| `getNeighborhood` | Extract subgraph within N edges of center | `symbol`, `file?`, `module?`, `package?`, `distance?`, `direction?`, `outputTypes?` |

### Symbol-Based Queries

All tools use a **SymbolQuery pattern** for inputs:

- **Required**: `symbol` - Symbol name (e.g., `"formatDate"`, `"User.save"`)
- **Optional filters**: `file`, `module`, `package` - Narrow scope when symbol name is ambiguous

If multiple symbols match, the tool returns candidates with their location details, allowing you to refine your query with additional filters.

### Example Outputs

All outputs include `offset` and `limit` fields that can be passed directly to the Read tool.

#### searchSymbols

Search for all symbols matching `User*`:

```
count: 3
files: 2

file: src/types.ts
module: core
package: main
matches: 2

interfaces[1]:
  User
    offset: 0, limit: 11
typeAliases[1]:
  UserId = string
    offset: 11, limit: 2

file: src/models/User.ts
module: models
package: main
matches: 1

classes[1]:
  UserService extends:BaseService implements:[IUserService]
    offset: 4, limit: 47
```

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

#### findPath

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

#### getNeighborhood

Get neighborhood around `User` interface with distance 1:

```bash
# Input
{ symbol: "User", distance: 1, outputTypes: ["text", "mermaid"] }

# Output
center: User (Interface)
file: src/types.ts
offset: 0, limit: 11
distance: 1
direction: both
nodeCount: 2
edgeCount: 2

src/types.ts (1 nodes):
interfaces[1]:
  Admin extends:[User]
    offset: 24, limit: 7

src/services/UserService.ts (1 nodes):
classes[1]:
  UserService
    offset: 4, limit: 47

edges[2]:
  Admin --EXTENDS--> User
  UserService --USES_TYPE--> User

---mermaid---
graph LR
  n0["User"]
  n1["Admin"]
  n2["UserService"]
  n1 -->|extends| n0
  n2 -->|uses type| n0
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
└── tools/       # MCP tool handlers (vertical slice architecture)
```

### Architecture

The project uses a vertical slice architecture where each MCP tool owns its complete stack (handler, query logic, formatting). See [ARCHITECTURE.md](ARCHITECTURE.md) for detailed technical documentation.

### Code Style

- Functional programming (no classes)
- Named exports only (no default exports)
- File naming matches primary export casing
- Tests colocated with implementation

## License

MIT
