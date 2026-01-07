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

### Query Functions

#### `queryEdges()` (`queryEdges.ts`)
Database-agnostic edge query function for use in integration tests:
- `queryEdges(db, filters?)` - Query edges with optional filters (type, sourcePattern, targetPattern, sourceId, targetId, context)
- Uses glob patterns (`*foo*`) not SQL LIKE patterns
- Returns `Edge[]` with camelCase properties (callCount, isTypeOnly, etc.)

### Interfaces

#### `DbWriter` (`DbWriter.ts`)
Write operations used by Ingestion Module:
- `addNodes()` / `addEdges()` - Batch upsert operations
- `removeFileNodes()` - Delete all nodes from a file (for re-indexing)
- `clearAll()` - Nuclear option: delete everything

### SQLite Implementation (`sqlite/`)

#### `sqliteConnection.utils.ts`
- `openDatabase()` - Create/open DB with WAL mode and performance settings
- `closeDatabase()` - Clean shutdown

#### `sqliteSchema.utils.ts`
- `initializeSchema()` - Create tables and indexes
- Schema design: `nodes` table (JSON properties column), `edges` table (composite PK)

#### `createSqliteWriter.ts`
- `createSqliteWriter()` - Factory returning DbWriter implementation
- Prepared statements with transactions for batch operations

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

### Edge Cleanup (No FK Constraints)
Edges are explicitly deleted before nodes in `removeFileNodes()`. The schema intentionally has **no foreign key constraints** on the edges table. This design enables:
- Parallel package indexing (no ordering dependencies)
- Backend-agnostic code (Neo4j/Memgraph don't use FK constraints)
- Dangling edges are harmless (queries use JOINs which filter them out)

### Upsert Semantics
Both `addNodes()` and `addEdges()` use upsert (insert or update). This allows re-indexing files without manual cleanup.

## Usage Patterns

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

- Used by: `src/ingestion` (writes via DbWriter), `src/tools/*` (direct SQL queries in each tool's query.ts)
- Depends on: `better-sqlite3` (SQLite driver)

## Architecture Notes

Read operations are not abstracted — each MCP tool in `src/tools/*/` implements its own direct SQL queries using recursive CTEs for graph traversal. Only write operations are abstracted through the `DbWriter` interface.
