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

### Project Structure

```
src/
├── config/      # Configuration loading and validation
├── db/          # Database layer (SQLite implementation)
├── ingestion/   # TypeScript AST parsing and graph extraction
└── mcp/         # MCP server and tool handlers
    └── tools/   # Vertical slice architecture (one folder per tool)
```

### Architecture

The project uses a vertical slice architecture where each MCP tool owns its complete stack (handler, query logic, formatting). See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for detailed technical documentation.

### Code Style

- Functional programming (no classes)
- Named exports only (no default exports)
- File naming matches primary export casing
- Tests colocated with implementation

## License

MIT
