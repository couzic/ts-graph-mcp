# ts-graph-mcp

A Model Context Protocol (MCP) server that extracts TypeScript code structure into a queryable graph database, enabling AI coding agents to explore and navigate codebases through structural relationships.

## What It Does

ts-graph-mcp parses TypeScript source code using AST analysis and builds a graph database of your codebase structure. The graph captures code symbols (functions, classes, interfaces, types, variables) and their relationships (calls, imports, type usage, inheritance).

AI agents can then query this graph through 7 specialized MCP tools to:

- Search for symbols by name patterns
- Traverse call graphs (who calls this? what does this call?)
- Analyze code impact (what breaks if I change this?)
- Find paths between symbols
- Extract neighborhood subgraphs with visual diagrams

All tool responses use a hierarchical text format optimized for LLM consumption, achieving approximately 60-70% token reduction compared to JSON.

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

The server exposes 7 tools for querying the code graph:

| Tool | Purpose | Key Parameters |
|------|---------|----------------|
| `search_nodes` | Search for symbols by name pattern | `pattern` (glob), `nodeType`, `module`, `package`, `exported` |
| `get_callers` | Find all functions/methods that call the target | `nodeId`, `maxDepth` (1-100) |
| `get_callees` | Find all functions/methods that the source calls | `nodeId`, `maxDepth` (1-100) |
| `get_impact` | Impact analysis - find all code affected by changes | `nodeId`, `maxDepth` (1-100) |
| `find_path` | Find shortest path between two nodes | `sourceId`, `targetId` |
| `get_neighbors` | Extract subgraph within N edges of center | `nodeId`, `distance` (1-100), `direction` |
| `get_file_symbols` | List all symbols defined in a file | `filePath` |

### Example Outputs

#### search_nodes

Search for all symbols matching `User*`:

```
count: 3
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
  UserService [5-50] exp extends:BaseService implements:[IUserService]
```

#### get_callers

Find all callers of `src/db/user.ts:saveUser`:

```
targetId: src/db/user.ts:saveUser
count: 2

src/api/handler.ts (1 callers):
functions[1]:
  handleRequest [10-25] exp async (req:Request) → Promise<Response>

src/services/UserService.ts (1 callers):
methods[1]:
  UserService.create [20-30] async (data:UserData) → Promise<User>
```

#### find_path

Find path from `src/api.ts:handleRequest` to `src/db.ts:saveData`:

```
sourceId: src/api.ts:handleRequest
targetId: src/db.ts:saveData
found: true
length: 2

path: src/api.ts:handleRequest --CALLS--> src/service.ts:process --CALLS--> src/db.ts:saveData
```

#### get_neighbors

Get neighborhood around `src/types.ts:User` with distance 1:

```
center: src/types.ts:User
centerType: Interface
distance: 1
direction: both
nodeCount: 2
edgeCount: 2

src/types.ts (1 nodes):
interfaces[1]:
  Admin [25-30] exp extends:[User]

src/services/UserService.ts (1 nodes):
classes[1]:
  UserService [5-50] exp

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

### Node ID Format

All tools reference nodes using a deterministic ID format:

```
{filePath}:{symbolPath}
```

Examples:

- File: `src/utils.ts`
- Function: `src/utils.ts:formatDate`
- Method: `src/models/User.ts:User.save`
- Property: `src/models/User.ts:User.name`

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
