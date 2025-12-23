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

The graph is exposed through an MCP server that provides 6 specialized tools for AI agents to:
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
│              (startMcpServer.ts dispatches to tool handlers)         │
├─────────────────────────────────────────────────────────────────┤
│                     Vertical Slice Tools                        │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐            │
│  │incomingCalls │ │outgoingCalls │ │analyzeImpact │  ... (x5)  │
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
│                    - edges table (6 types)                      │
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

**Shared Utilities** (`src/tools/shared/`):
- `SymbolQuery.ts` - Reusable Zod schema for symbol-based queries (used by all tools)
- `resolveSymbol.ts` - Symbol resolution with disambiguation (unique/ambiguous/not_found)
- `validateSymbolExists.ts` - Symbol existence validation with helpful error messages
- `nodeFormatters.ts` - Output formatting utilities

## Module Organization

### `/src/db/` - Database Layer

**Purpose**: Persistence layer for the code graph.

**Key Files**:
- `Types.ts` - Core data types (Node, Edge, Path, Subgraph, SearchFilters, etc.)
- `DbWriter.ts` - Write interface for graph mutations (4 methods)

**SQLite Implementation** (`sqlite/`):
- `sqliteConnection.utils.ts` - Database lifecycle (open/close with WAL mode)
- `sqliteSchema.utils.ts` - Schema initialization (tables, indexes)
- `createSqliteWriter.ts` - Implements DbWriter with prepared statements and transactions

**Note**: Query logic lives in each tool's `query.ts` file (`src/tools/*/query.ts`), using direct SQL queries via better-sqlite3. This vertical slice approach eliminates the need for a shared reader abstraction.

**Design Highlights**:
- Interface-first design allows pluggable backends
- Recursive CTEs for efficient graph traversals with cycle detection
- No FK constraints - enables parallel indexing, backend-agnostic design (queries use JOINs to filter dangling edges)
- Upsert semantics (insert or update) for idempotent operations

**Why No Foreign Key Constraints:**

The schema intentionally omits FK constraints on edges table for three key reasons:

1. **Query-time filtering** - All graph traversals JOIN with nodes table, automatically filtering dangling edges:
   ```sql
   SELECT n.* FROM edges e JOIN nodes n ON e.target = n.id
   ```

2. **Backend agnostic** - Graph databases like Neo4j/Memgraph don't use FK constraints. This design works uniformly across all backends.

3. **Parallel processing** - Packages can be indexed in any order or simultaneously without FK violations. No staging tables or deferred resolution needed.

4. **Memory efficiency** - Combined with streaming ingestion, allows processing arbitrarily large codebases with constant memory (~100MB regardless of project size)

### `/src/ingestion/` - Code Extraction Pipeline

**Purpose**: Parse TypeScript source code and extract graph structure.

**Key Files**:
- `indexProject.ts` - Public API (`indexProject`)
- `Extractor.ts` - Orchestrates extraction: nodes first, then edges
- `NodeExtractors.ts` - Extracts 8 node types from AST (Function, Class, Method, etc.)
- `EdgeExtractors.ts` - Extracts 6 edge types from AST (CALLS, IMPORTS, etc.)
- `generateNodeId.ts` - Generates deterministic node IDs (`{filePath}:{symbolPath}`)
- `normalizeTypeText.ts` - Collapses multiline TypeScript types to single line

**Design Highlights**:
- Streaming architecture: processes one file at a time (nodes → write → edges → write)
- Cross-file resolution via `buildImportMap` (no global nodes array needed)
- Memory efficient: O(1) per file, scales to any codebase size
- Uses ts-morph for type-aware AST parsing with tsconfig integration
- No dangling edge filtering needed: queries use JOINs to filter automatically

### `/src/config/` - Configuration Management

**Purpose**: Load and validate project configuration using Zod schemas.

**Key Files**:
- `Config.schemas.ts` - Zod schemas and type definitions
- `defineConfig.ts` - Type-safe config helper function
- `configLoader.utils.ts` - Auto-detects and loads config files (.ts, .js, .json)

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

**Purpose**: Exposes the code graph as an MCP server with 8 focused tools.

**Key Files**:
- `startMcpServer.ts` - Server implementation with 8 tool registrations
- `main.ts` - CLI entry point with auto-indexing on first run

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

### Edge Types (6 Total)

All edges have source/target/type plus edge-specific metadata:

```typescript
Edge {
  source: string          // Source node ID
  target: string          // Target node ID
  type: EdgeType          // CALLS|IMPORTS|CONTAINS|etc.

  // Edge-specific metadata:
  callCount?: number              // CALLS edges
  callSites?: number[]            // CALLS edges: line numbers where calls occur
  isTypeOnly?: boolean            // IMPORTS edges
  importedSymbols?: string[]      // IMPORTS edges
  context?: "parameter"|"return"  // USES_TYPE edges
}
```

**Edge Types**:

1. **CALLS** - Function/method invocations (tracks `callCount` and `callSites` line numbers)
2. **IMPORTS** - File-to-file imports (tracks `importedSymbols`, `isTypeOnly`)
3. **CONTAINS** - File contains top-level symbols (no nested members)
4. **IMPLEMENTS** - Class implements interface
5. **EXTENDS** - Class/interface inheritance
6. **USES_TYPE** - Type references in parameters/returns/properties (tracks `context`)

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
  PRIMARY KEY (source, target, type)
  -- No FK constraints: queries use JOINs to filter dangling edges
);
```

**Indexes**:
- Nodes: `file_path`, `type`, `name`, `module`, `package`, `exported`
- Edges: `source`, `target`, `type` (for traversal queries)

## Data Flow

### Indexing Pipeline

The ingestion pipeline uses a **streaming architecture** that processes files individually without accumulating data in memory:

```
TypeScript Source Files
        ↓
┌─────────────────────────────────────────────┐
│  For each package in config (can parallelize) │
└──────────────────┬──────────────────────────┘
                   ↓
         ┌─────────────────────┐
         │  ts-morph Project   │
         │  (AST with tsconfig) │
         └──────────┬──────────┘
                    ↓
    ┌───────────────────────────────────┐
    │  For each file in package:        │
    │                                   │
    │  1. Extract Nodes                 │
    │     - Walk AST                    │
    │     - Generate deterministic IDs  │
    │     - Capture metadata            │
    │     ↓                             │
    │  2. Write Nodes to DB             │
    │     - Upsert (insert or update)   │
    │     ↓                             │
    │  3. Extract Edges                 │
    │     - Build import map (local)    │
    │     - Resolve cross-file refs     │
    │     - Walk AST for relationships  │
    │     ↓                             │
    │  4. Write Edges to DB             │
    │     - Upsert (insert or update)   │
    └───────────────────────────────────┘
```

**Key Characteristics**:
- **Streaming**: Each file is fully processed before moving to the next
- **No global state**: No accumulation of all nodes in memory
- **Memory efficient**: O(1) per file - only current file's import map in memory (~100 entries max)
- **Scales linearly**: 1K files or 100K files use same peak memory (~100MB)
- **Parallelizable**: Packages can be indexed in parallel (no cross-package dependencies)

### Cross-File Edge Resolution

Edge extractors use **`buildImportMap`** for cross-file resolution without needing a global nodes array:

```typescript
// 1. Build local import map (ts-morph resolves paths)
const importMap = buildImportMap(sourceFile, filePath);
// Returns: Map<"User", "shared/types.ts:User">

// 2. Resolve calls/type references using map
const targetId = importMap.get(symbolName);
if (targetId) {
  edges.push({ source, target: targetId, type: "CALLS" });
}
```

**How it works**:
1. ts-morph resolves import paths (handles aliases like `@shared/*`)
2. Import map constructs target IDs: `{targetPath}:{symbolName}`
3. Edge extractors look up imported symbols in local map
4. No need to validate target exists - queries use JOINs to filter

### Why Two-Pass Per File?

**Pass 1 (Nodes)**: Establishes all symbols in the file for same-file edge resolution. Writes immediately to database.

**Pass 2 (Edges)**: With all nodes known (local + imported via map), edge extraction can:
- Build CONTAINS edges (file → top-level symbols)
- Resolve symbol references to node IDs using import map
- Create cross-file edges without global state

### Dangling Edge Handling

**No pre-filtering required**. Edges pointing to non-existent nodes are harmless because:

1. **Queries use JOINs** - All graph traversals JOIN with nodes table:
   ```sql
   SELECT n.* FROM edges e JOIN nodes n ON e.target = n.id
   ```
   Non-existent targets are automatically filtered.

2. **CTEs terminate naturally** - Recursive CTEs can't traverse to missing nodes:
   ```sql
   WITH RECURSIVE callers(id) AS (
     SELECT source FROM edges WHERE target = ?
     UNION
     SELECT e.source FROM edges e JOIN callers c ON e.target = c.id
   )
   ```
   Missing nodes simply end that traversal branch.

3. **Enables parallel processing** - No FK constraints means packages can be indexed in any order

## MCP Tools

The MCP server exposes 6 focused tools for querying the code graph. All tools use symbol-based queries with optional filters (`file`, `module`, `package`) for disambiguation.

**For detailed parameter documentation, see [`src/tools/CLAUDE.md`](src/tools/CLAUDE.md).**

| Category | Tool | Purpose |
|----------|------|---------|
| **Call Graph** | `incomingCallsDeep` | Find callers (transitive) |
| | `outgoingCallsDeep` | Find callees (transitive) |
| **Package Deps** | `incomingPackageDeps` | Find reverse package deps |
| | `outgoingPackageDeps` | Find package dependencies |
| **Analysis** | `analyzeImpact` | Impact analysis |
| | `findPaths` | Find paths between symbols |

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

## LSP Tool Overlap

Claude Code 2.0.74+ includes a built-in LSP (Language Server Protocol) tool. This section documents the overlap and differentiators.

### LSP Capabilities

The built-in LSP tool provides:
- `goToDefinition` - Find where a symbol is defined
- `findReferences` - Find all references to a symbol
- `hover` - Get documentation and type info
- `documentSymbol` - Get all symbols in a file
- `workspaceSymbol` - Search for symbols across the workspace
- `goToImplementation` - Find interface implementations
- `incomingCalls` - Find direct callers of a function
- `outgoingCalls` - Find direct callees of a function

### Feature Comparison

| Feature | LSP Tool | ts-graph-mcp | Overlap |
|---------|----------|--------------|---------|
| Symbols in file | `documentSymbol` | ❌ (removed) | None - use LSP |
| Search symbols | `workspaceSymbol` | ❌ (removed) | None - use LSP |
| Direct callers | `incomingCalls` | `incomingCallsDeep(maxDepth=1)` | **Partial** - ts-graph has transitive traversal |
| Direct callees | `outgoingCalls` | `outgoingCallsDeep(maxDepth=1)` | **Partial** - ts-graph has transitive traversal |
| Implementations | `goToImplementation` | ❌ (removed) | None - use LSP |
| Definition lookup | `goToDefinition` | ❌ | None |
| Hover docs | `hover` | ❌ | None |
| **Transitive call graph** | ❌ | `incomingCallsDeep/outgoingCallsDeep` | **Unique** |
| **Package dependencies** | ❌ | `outgoingPackageDeps/incomingPackageDeps` | **Unique** |
| **Impact analysis** | ❌ | `analyzeImpact` | **Unique** |
| **Path finding** | ❌ | `findPaths` | **Unique** |

### Removed Tools

**`get_file_symbols`** - Removed entirely (previously deprecated). Use LSP `documentSymbol` instead, which provides real-time results without pre-indexing.

**`getNeighborhood`** - Removed in favor of focused tools. The generic neighborhood query returned ALL edge types (CALLS, IMPORTS, USES_TYPE, etc.), causing exponential output growth. Replaced by focused tools that each traverse one relationship type.

**`incomingExtends/outgoingExtends`** - Removed because modern TypeScript favors composition over deep inheritance. Class hierarchies are typically shallow (2-3 levels) and localized, making simple grep patterns (`extends ClassName`) sufficient. Benchmarks showed MCP overhead exceeded benefit for realistic inheritance queries.

**`incomingUsesType/outgoingUsesType`** - Removed because LSP `findReferences` + `analyzeImpact` cover the use cases better. The unique feature (context filtering: parameter/return/property) is rarely needed in practice. For "what uses this type?" use LSP; for "what breaks if I change this type?" use `analyzeImpact`.

**`incomingImports/outgoingImports`** - Removed because import relationships are direct (no transitivity needed) and visible (at top of every file). LSP `findReferences` handles "what imports this export" and reading the file shows "what does this file import".

### When to Use Each

**Use LSP when:**
- You need real-time, up-to-date information (no indexing lag)
- Simple point-to-point queries (definition, direct references)
- Working with a single function's immediate context

**Use ts-graph-mcp when:**
- You need **transitive** analysis (callers of callers, all downstream dependencies)
- **Impact analysis** (what breaks if I change this?)
- **Path finding** (how does data flow from A to B?)
- **Architectural queries** (filter by module/package, visualize neighborhoods)
- Working with **pre-indexed** data for consistent snapshots

---

## Known Limitations

### 1. Streaming Architecture Performance

**Status**: Implemented and optimized

The streaming architecture processes files one-by-one (nodes → write → edges → write), providing excellent memory efficiency but requiring database writes per file.

**Performance characteristics:**
- **Memory**: O(1) per file - constant ~100MB regardless of project size
- **Speed**: Linear with file count - typical projects index in seconds
- **Scalability**: Successfully tested on projects with 10K+ files

**Comparison to batch processing:**

| Project Size | Streaming Memory | Batch Memory | Speed Difference |
|--------------|------------------|--------------|------------------|
| 1K files (50K nodes) | ~100 MB | ~150 MB | Comparable |
| 10K files (500K nodes) | ~100 MB | ~2 GB | Streaming faster (no GC pressure) |
| 100K files (5M nodes) | ~100 MB | ~20 GB (fails) | Streaming only option |

The trade-off of more frequent DB writes is offset by:
- No memory pressure or garbage collection overhead
- Better parallelization potential (packages can process independently)
- Simpler implementation without staging logic

### 2. Cross-Module Edge Resolution

**Status**: Working

Cross-module edges (CALLS, USES_TYPE, IMPORTS, etc.) are correctly extracted when packages use tsconfig project references and path aliases.

**How it works**:
- ts-morph loads all referenced projects when given a tsconfig with `references`
- `getModuleSpecifierSourceFile()` resolves imports across package boundaries
- Edge extractors use `buildImportMap` to resolve cross-module symbols
- The source file filter in `processPackage()` limits *extraction* to the current package, but ts-morph retains knowledge of all referenced files for resolution

**Requirements for cross-module resolution**:
- Packages must have proper tsconfig `references` fields
- Path aliases (e.g., `@shared/*`) must be configured in tsconfig `paths`

See `sample-projects/web-app/` and `sample-projects/monorepo/` for working examples with 9 and 22 cross-module edges respectively.

### 3. Output Format Optimization

**Status**: Implemented via vertical slice architecture

Each MCP tool has its own `format.ts` file producing hierarchical text output optimized for LLM consumption:
- ~60-70% token reduction vs JSON
- Metadata hoisting: when nodes share `module`/`package`/`filePath`, values appear once at top
- Type-grouped output with counts
- Mermaid diagrams for subgraph visualization

See `docs/toon-optimization/` for historical analysis that informed the current format.

### 4. SQLite Only

The `DbWriter` interface exists for writes, but query logic is embedded in each tool's `query.ts` file using direct SQLite queries.

### 5. No File Watching

Server doesn't auto-refresh on code changes. Requires restart to pick up changes.

---

## Further Reading

- **[ISSUES.md](ISSUES.md)** - Known bugs and technical debt
- **[docs/configuration.md](docs/configuration.md)** - Configuration file reference
- **[ROADMAP.md](ROADMAP.md)** - Development roadmap
