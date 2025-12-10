# DB Module

## Purpose

Persistence layer for the TypeScript code graph. Provides read/write interfaces and SQLite implementation for storing nodes (functions, classes, types, etc.) and edges (calls, imports, type usage, etc.).

## Key Exports

### Types (`Types.ts`)
- `Node` - Discriminated union of all node types (Function, Class, Method, Interface, TypeAlias, Variable, File, Property)
- `Edge` - Relationship between nodes with type-specific metadata
- `Subgraph` - A center node with its neighbors and connecting edges
- `Path` - Shortest path result between two nodes
- `SearchFilters`, `TraversalOptions`, `NeighborOptions` - Query configuration types

### Interfaces

#### `DbReader` (`DbReader.ts`)
Read-only graph queries used by MCP Server:
- `getCallersOf()` / `getCalleesOf()` - Traverse call graph
- `getTypeUsages()` - Find where types are used
- `getImpactedBy()` - Impact analysis (what depends on this?)
- `getPathBetween()` - Shortest path between nodes
- `searchNodes()` - Search by name pattern with filters
- `getNodeById()` / `getFileNodes()` - Direct node lookups
- `findNeighbors()` - Get neighborhood subgraph

#### `DbWriter` (`DbWriter.ts`)
Write operations used by Ingestion Module:
- `addNodes()` / `addEdges()` - Batch upsert operations
- `removeFileNodes()` - Delete all nodes from a file (for re-indexing)
- `clearAll()` - Nuclear option: delete everything

### SQLite Implementation (`sqlite/`)

#### `SqliteConnection.ts`
- `openDatabase()` - Create/open DB with WAL mode and performance settings
- `closeDatabase()` - Clean shutdown

#### `SqliteSchema.ts`
- `initializeSchema()` - Create tables and indexes
- Schema design: `nodes` table (JSON properties column), `edges` table (composite PK)

#### `SqliteReader.ts`
- `createSqliteReader()` - Factory returning DbReader implementation
- Uses recursive CTEs for graph traversal queries

#### `SqliteWriter.ts`
- `createSqliteWriter()` - Factory returning DbWriter implementation
- Prepared statements with transactions for batch operations

### Utilities

#### `SubgraphToMermaid.ts`
- `subgraphToMermaid()` - Convert Subgraph to Mermaid flowchart syntax
- Used by MCP Server to generate visual diagrams

## Critical Information

### Node ID Format
Node IDs follow the pattern: `{relativePath}:{symbolPath}`

Examples:
- `src/utils.ts:formatDate` - Function in file
- `src/models/User.ts:User` - Class
- `src/models/User.ts:User.save` - Method

This format is deterministic and human-readable.

### Properties Storage
Node-specific properties (parameters, return types, etc.) are stored as JSON in the `properties` column. Base properties (id, type, name, module, package, filePath, etc.) have dedicated columns for efficient querying.

### Edge Metadata
Common edge metadata (call_count, is_type_only, imported_symbols, context) stored in dedicated columns for performance. All edges have composite unique key: (source, target, type).

### Traversal Depth
Default max depth is 100 for most traversals (1 for type usage). Recursive CTEs prevent infinite loops and cycle detection is built-in.

### Foreign Key Cascades
Edges cascade-delete when nodes are removed. This ensures graph consistency when re-indexing files.

### Upsert Semantics
Both `addNodes()` and `addEdges()` use upsert (insert or update). This allows re-indexing files without manual cleanup.

## Usage Patterns

### Read Operations (MCP Server)
```typescript
const reader = createSqliteReader(db);
const callers = await reader.getCallersOf('src/utils.ts:formatDate');
const subgraph = await reader.findNeighbors('src/User.ts:User', { distance: 2 });
const mermaid = subgraphToMermaid(subgraph);
```

### Write Operations (Ingestion)
```typescript
const writer = createSqliteWriter(db);
await writer.removeFileNodes('src/utils.ts'); // Clear old data
await writer.addNodes(nodes); // Batch insert
await writer.addEdges(edges); // Batch insert
```

### Database Lifecycle
```typescript
const db = openDatabase({ path: './graph.db' });
// ... use db ...
closeDatabase(db);
```

## Related Modules

- Used by: `src/ingestion` (writes), `src/mcp` (reads)
- Depends on: `better-sqlite3` (SQLite driver)
