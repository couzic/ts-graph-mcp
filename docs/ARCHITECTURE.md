# Architecture

This document describes the technical architecture of **ts-graph-mcp**, an MCP (Model Context Protocol) server that extracts TypeScript code structure into a graph database, enabling AI coding agents to explore and understand codebases semantically.

## Table of Contents

- [Project Overview](#project-overview)
- [High-Level Architecture](#high-level-architecture)
- [Module Organization](#module-organization)
- [Data Model](#data-model)
- [Data Flow](#data-flow)
- [MCP Tools](#mcp-tools)
- [Key Technologies](#key-technologies)
- [Code Style Conventions](#code-style-conventions)
- [Known Limitations](#known-limitations)

## Project Overview

**ts-graph-mcp** parses TypeScript source code using AST (Abstract Syntax Tree) analysis and builds a queryable graph database of code structure. The graph captures:

- **Nodes**: Code symbols (functions, classes, methods, interfaces, types, variables, files, properties)
- **Edges**: Relationships between symbols (calls, imports, type usage, inheritance, etc.)

The graph is exposed through an MCP server that provides 7 specialized tools for AI agents to:
- Search for symbols by name patterns
- Traverse call graphs (who calls this? what does this call?)
- Analyze code impact (what breaks if I change this?)
- Find paths between symbols
- Extract neighborhood subgraphs

Tool responses use a **hierarchical text format** optimized for LLM consumption (~60-70% token reduction vs JSON), plus **Mermaid diagrams** for visual subgraph representation.

## High-Level Architecture

The project uses a **vertical slice architecture** where each MCP tool owns its complete stack:

```
┌─────────────────────────────────────────────────────────────────┐
│                        MCP Server Layer                         │
│              (McpServer.ts dispatches to tool handlers)         │
├─────────────────────────────────────────────────────────────────┤
│                     Vertical Slice Tools                        │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐            │
│  │ search-nodes │ │ get-callers  │ │ get-callees  │  ... (x7)  │
│  │  handler.ts  │ │  handler.ts  │ │  handler.ts  │            │
│  │  query.ts    │ │  query.ts    │ │  query.ts    │            │
│  │  format.ts   │ │  format.ts   │ │  format.ts   │            │
│  └──────┬───────┘ └──────┬───────┘ └──────┬───────┘            │
│         │ direct SQL     │                │                     │
└─────────┼────────────────┼────────────────┼─────────────────────┘
          ↓                ↓                ↓
┌─────────────────────────────────────────────────────────────────┐
│                    SQLite Database (graph.db)                   │
│                    - nodes table (8 types)                      │
│                    - edges table (8 types)                      │
└────────────────────────────────┬────────────────────────────────┘
                                 ↑ writes
                                 │
┌────────────────────────────────┴────────────────────────────────┐
│                    Ingestion Pipeline                           │
│          (Extractor, NodeExtractors, EdgeExtractors)            │
│                            ↑                                    │
│                            │ parses                             │
│                   TypeScript Source (ts-morph)                  │
└─────────────────────────────────────────────────────────────────┘
```

### Layer Flow

1. **MCP Layer** (`src/mcp/`) - Exposes graph via MCP protocol (stdio transport)
2. **Database Layer** (`src/db/`) - SQLite connection, schema, and writer (no shared reader abstraction)
3. **Ingestion Layer** (`src/ingestion/`) - Parses TypeScript AST and extracts graph nodes/edges
4. **Configuration Layer** (`src/config/`) - Validates and loads project configuration

### Module Dependencies

```
tools/* → db (direct SQL queries via better-sqlite3)
ingestion → db (DbWriter)
ingestion → config (ProjectConfig)
db → (no dependencies on other modules)
config → (no dependencies on other modules)
```

Each MCP tool folder (`src/tools/<tool>/`) contains:
- `handler.ts` - MCP tool definition and execute function
- `query.ts` - Direct SQL queries using recursive CTEs
- `format.ts` - Output formatting for LLM consumption

## Module Organization

### `/src/db/` - Database Layer

**Purpose**: Persistence layer for the code graph.

**Key Files**:
- `Types.ts` - Core data types (Node, Edge, Path, Subgraph, SearchFilters, etc.)
- `DbWriter.ts` - Write interface for graph mutations (4 methods)

**SQLite Implementation** (`sqlite/`):
- `SqliteConnection.ts` - Database lifecycle (open/close with WAL mode)
- `SqliteSchema.ts` - Schema initialization (tables, indexes, FKs)
- `SqliteWriter.ts` - Implements DbWriter with prepared statements and transactions

**Note**: Query logic lives in each tool's `query.ts` file (`src/tools/*/query.ts`), using direct SQL queries via better-sqlite3. This vertical slice approach eliminates the need for a shared reader abstraction.

**Design Highlights**:
- Interface-first design allows pluggable backends (SQLite today, Neo4j/Memgraph future)
- Recursive CTEs for efficient graph traversals with cycle detection
- Foreign key cascades ensure referential integrity
- Upsert semantics (insert or update) for idempotent operations

### `/src/ingestion/` - Code Extraction Pipeline

**Purpose**: Parse TypeScript source code and extract graph structure.

**Key Files**:
- `Ingestion.ts` - Public API (`indexProject`, `indexFile`, `removeFile`)
- `Extractor.ts` - Orchestrates extraction: nodes first, then edges
- `NodeExtractors.ts` - Extracts 8 node types from AST (Function, Class, Method, etc.)
- `EdgeExtractors.ts` - Extracts 8 edge types from AST (CALLS, IMPORTS, etc.)
- `IdGenerator.ts` - Generates deterministic node IDs (`{filePath}:{symbolPath}`)
- `normalizeTypeText.ts` - Collapses multiline TypeScript types to single line

**Design Highlights**:
- Two-pass extraction: nodes first to establish all symbols, then edges
- Incremental indexing via `indexFile()` with automatic cleanup
- Uses ts-morph for type-aware AST parsing with tsconfig integration
- Dangling edge filtering: edges to non-existent nodes are dropped

### `/src/config/` - Configuration Management

**Purpose**: Load and validate project configuration using Zod schemas.

**Key Files**:
- `ConfigSchema.ts` - Zod schemas for validation + `defineConfig()` helper
- `ConfigLoader.ts` - Auto-detects and loads config files (.ts, .js, .json)

**Configuration Structure**:
```typescript
{
  modules: [
    {
      name: "core",
      packages: [
        { name: "main", tsconfig: "./tsconfig.json" }
      ]
    }
  ],
  storage?: {
    type: "sqlite",
    path: ".ts-graph-mcp/graph.db"
  },
  watch?: {
    include?: string[],  // glob patterns
    exclude?: string[],
    debounce?: number    // ms
  }
}
```

### `/src/mcp/` - MCP Server

**Purpose**: Exposes the code graph as an MCP server with 7 tools.

**Key Files**:
- `McpServer.ts` - Server implementation with 7 tool registrations
- `StartServer.ts` - CLI entry point with auto-indexing on first run

**Design Highlights**:
- Stdio transport only (designed for MCP protocol)
- Hierarchical text responses for token efficiency (~60-70% reduction vs JSON)
- Mermaid diagrams for visual subgraphs
- Zod validation of all tool inputs
- Auto-indexing if database doesn't exist on startup

## Data Model

### Node Types (8 Total)

All nodes share a common base structure with type-specific properties:

```typescript
BaseNode {
  id: string              // "{filePath}:{symbolPath}" e.g., "src/utils.ts:formatDate"
  type: NodeType          // Discriminator: Function|Class|Method|Interface|etc.
  name: string            // Symbol name: "formatDate", "User", etc.
  module: string          // Module name from config
  package: string         // Package name from config
  filePath: string        // Relative file path
  startLine: number       // 1-indexed start line
  endLine: number         // 1-indexed end line
  exported: boolean       // Whether exported from module
}
```

**Specialized Node Types**:

1. **Function** - `parameters[]`, `returnType`, `async`
2. **Class** - `extends`, `implements[]`
3. **Method** - `parameters[]`, `returnType`, `async`, `visibility`, `static`
4. **Interface** - `extends[]`
5. **TypeAlias** - `aliasedType`
6. **Variable** - `variableType`, `isConst`
7. **File** - `extension`
8. **Property** - `propertyType`, `optional`, `readonly`

### Edge Types (8 Total)

All edges have source/target/type plus edge-specific metadata:

```typescript
Edge {
  source: string          // Source node ID
  target: string          // Target node ID
  type: EdgeType          // CALLS|IMPORTS|CONTAINS|etc.

  // Edge-specific metadata:
  callCount?: number              // CALLS edges
  isTypeOnly?: boolean            // IMPORTS edges
  importedSymbols?: string[]      // IMPORTS edges
  context?: "parameter"|"return"  // USES_TYPE edges
}
```

**Edge Types**:

1. **CALLS** - Function/method invocations (tracks `callCount`)
2. **IMPORTS** - File-to-file imports (tracks `importedSymbols`, `isTypeOnly`)
3. **CONTAINS** - File contains top-level symbols (no nested members)
4. **IMPLEMENTS** - Class implements interface
5. **EXTENDS** - Class/interface inheritance
6. **USES_TYPE** - Type references in parameters/returns/properties (tracks `context`)
7. **READS_PROPERTY** - Property access (reads)
8. **WRITES_PROPERTY** - Property assignment (writes)

### Node ID Format

Node IDs are deterministic and hierarchical:

```
File:       src/utils.ts
Function:   src/utils.ts:formatDate
Method:     src/models/User.ts:User.save
Property:   src/models/User.ts:User.name
```

**Format**: `{relativePath}:{symbolPath}`

- **Separator**: Colon (`:`) separates file path from symbol path
- **Nesting**: Dots (`.`) represent symbol hierarchy within a file
- **Uniqueness**: Guaranteed unique within a project
- **Readability**: Human-readable and parseable

### Database Schema

**SQLite Tables**:

```sql
CREATE TABLE nodes (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  name TEXT NOT NULL,
  module TEXT NOT NULL,
  package TEXT NOT NULL,
  file_path TEXT NOT NULL,
  start_line INTEGER NOT NULL,
  end_line INTEGER NOT NULL,
  exported INTEGER NOT NULL DEFAULT 0,
  properties TEXT NOT NULL DEFAULT '{}'  -- JSON for type-specific props
);

CREATE TABLE edges (
  source TEXT NOT NULL,
  target TEXT NOT NULL,
  type TEXT NOT NULL,
  call_count INTEGER,
  is_type_only INTEGER,
  imported_symbols TEXT,  -- JSON array
  context TEXT,
  PRIMARY KEY (source, target, type),
  FOREIGN KEY (source) REFERENCES nodes(id) ON DELETE CASCADE,
  FOREIGN KEY (target) REFERENCES nodes(id) ON DELETE CASCADE
);
```

**Indexes**:
- Nodes: `file_path`, `type`, `name`, `module`, `package`, `exported`
- Edges: `source`, `target`, `type` (for traversal queries)

## Data Flow

### Indexing Pipeline

```
TypeScript Source Files
        ↓
  ts-morph Project (AST)
        ↓
┌───────────────────────┐
│  Pass 1: Extract Nodes │
│  - Walk AST           │
│  - Generate Node IDs  │
│  - Extract metadata   │
└──────────┬────────────┘
           ↓
    All Nodes Collected
           ↓
┌───────────────────────┐
│  Pass 2: Extract Edges │
│  - Walk AST again     │
│  - Build symbol maps  │
│  - Extract references │
└──────────┬────────────┘
           ↓
    All Edges Collected
           ↓
┌───────────────────────┐
│  Filter Dangling Edges │
│  - Remove edges to    │
│    non-existent nodes │
│  - Keep only internal │
│    references         │
└──────────┬────────────┘
           ↓
┌───────────────────────┐
│  Write to Database    │
│  1. Delete old file   │
│     nodes (cascade)   │
│  2. Upsert nodes      │
│  3. Upsert edges      │
└───────────────────────┘
```

### Why Two-Pass Extraction?

**Pass 1 (Nodes)**: Establishes all symbols in the file before extracting relationships. This creates a complete symbol table for reference during edge extraction.

**Pass 2 (Edges)**: With all nodes known, edge extraction can:
- Build CONTAINS edges (file → top-level symbols)
- Resolve symbol references to node IDs
- Validate edge targets exist

### Incremental Updates

The `indexFile()` API supports incremental re-indexing:

```typescript
// 1. Remove old data for file (cascades to edges)
await dbWriter.removeFileNodes(filePath);

// 2. Extract fresh nodes and edges
const { nodes, edges } = extractFromSourceFile(sourceFile, context);

// 3. Write to database (upsert)
await dbWriter.addNodes(nodes);
await dbWriter.addEdges(edges);
```

## MCP Tools

The MCP server exposes 7 tools for querying the code graph:

### 1. `search_nodes`

**Purpose**: Search for nodes by name pattern with filters.

**Parameters**:
- `pattern` (required): Glob pattern (e.g., `"handle*"`, `"User*Service"`)
- `nodeType` (optional): Filter by type (Function, Class, etc.)
- `module` (optional): Filter by module name
- `package` (optional): Filter by package name
- `exported` (optional): Filter by export status

### 2. `get_callers`

**Purpose**: Find all functions/methods that call the target (reverse call graph).

**Parameters**:
- `nodeId` (required): Target function/method ID
- `maxDepth` (optional): Traversal depth (1-100, default: 100)

### 3. `get_callees`

**Purpose**: Find all functions/methods that the source calls (forward call graph).

**Parameters**:
- `nodeId` (required): Source function/method ID
- `maxDepth` (optional): Traversal depth (1-100, default: 100)

### 4. `get_impact`

**Purpose**: Impact analysis - find all code affected by changes to a node.

**Parameters**:
- `nodeId` (required): Node to analyze
- `maxDepth` (optional): Traversal depth (default: 100)

### 5. `find_path`

**Purpose**: Find shortest path between two nodes using BFS.

**Parameters**:
- `sourceId` (required): Starting node ID
- `targetId` (required): Ending node ID

### 6. `get_neighbors`

**Purpose**: Extract subgraph - all nodes within N edges of center.

**Parameters**:
- `nodeId` (required): Center node ID
- `distance` (optional): Maximum edge distance (1-100, default: 1)
- `direction` (optional): `"outgoing"` | `"incoming"` | `"both"` (default: "both")

### 7. `get_file_symbols`

**Purpose**: List all symbols defined in a file.

**Parameters**:
- `filePath` (required): Relative file path

## Key Technologies

### Production Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| `@modelcontextprotocol/sdk` | ^1.0.0 | MCP server implementation |
| `ts-morph` | ^24.0.0 | TypeScript AST parsing |
| `better-sqlite3` | ^11.0.0 | SQLite database driver |
| `@toon-format/toon` | ^2.1.0 | Token-efficient response encoding |
| `zod` | ^3.0.0 | Runtime schema validation |
| `chokidar` | ^4.0.0 | File watching |
| `commander` | ^12.0.0 | CLI argument parsing |

### Development Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| `vitest` | ^2.0.0 | Test runner |
| `@biomejs/biome` | 2.3.8 | Linter and formatter |
| `typescript` | ^5.0.0 | Type checking and compilation |

## Code Style Conventions

### Functional Programming

- **No classes**: All code uses functions and plain objects
- **Pure functions**: Prefer immutability and side-effect-free functions
- **Composition**: Build complex logic from small, composable functions

### Named Exports Only

- **No default exports**: All exports are named
- **Clarity**: Import statements explicitly show what's being imported
- **Refactoring safety**: Renaming exports updates all import sites

### File Naming Convention

Files are named to match their primary export:

- **Type/Interface exports** → **PascalCase**: `Types.ts` exports `Node`, `Edge`
- **Function exports** → **camelCase**: `normalizeTypeText.ts` exports `normalizeTypeText`

**No index.ts barrel files** - Direct imports required.

### Test Conventions

1. **Colocated tests**: Test files live next to implementation
2. **Refactor-safe describe blocks**: Use `describe(functionName.name, ...)` for refactoring safety
3. **Test names without "should"**: Use direct statements like `it('parses incomplete input', ...)`

### Verification Workflow

Always run `npm run check` before committing:

```bash
npm run check  # Runs: test → build → lint:fix
```

## Known Limitations

### 1. Cross-Module Edge Resolution

**Status**: Known issue with planned fix (see ISSUES.md #5, ROADMAP.md)

Edges that cross module boundaries are currently dropped during ingestion. This is a **high-priority bug** blocking monorepo support, not an accepted limitation.

**Fix strategy**: Deferred Edge Table - collect edges during indexing, resolve after all modules are indexed. See ISSUES.md for implementation details.

### 2. Output Format Optimization

**Status**: Implemented via vertical slice architecture

Each MCP tool has its own `format.ts` file producing hierarchical text output optimized for LLM consumption:
- ~60-70% token reduction vs JSON
- Metadata hoisting: when nodes share `module`/`package`/`filePath`, values appear once at top
- Type-grouped output with counts
- Mermaid diagrams for subgraph visualization

See `docs/toon-optimization/` for historical analysis that informed the current format.

### 3. No Incremental File Watching (Yet)

**Status**: Planned feature (chokidar dependency already added)

Server doesn't auto-refresh on code changes. Requires restart to pick up changes.

### 4. SQLite Only

**Status**: By design (Neo4j/Memgraph support planned)

The `DbWriter` interface exists for writes, but query logic is embedded in each tool's `query.ts` file using direct SQLite queries. Supporting other backends would require abstracting the recursive CTE queries.

---

## Further Reading

- **[ISSUES.md](../ISSUES.md)** - Known bugs and technical debt
- **[docs/configuration.md](./configuration.md)** - Configuration file reference
- **[docs/FEATURES.md](./FEATURES.md)** - Feature documentation
- **[docs/ROADMAP.md](./ROADMAP.md)** - Development roadmap
- **[docs/api/](./api/)** - API documentation
- **[docs/toon-optimization/](./toon-optimization/)** - TOON output optimization analysis
