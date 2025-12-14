# Ingestion Module

Parses TypeScript source code using ts-morph AST and extracts nodes (symbols) and edges (relationships) for storage in the graph database.

## Key Exports

### Public API (`Ingestion.ts`)

- `indexProject` - Index entire project based on config (processes all modules/packages)
- `indexFile` - Index a single file incrementally (auto-removes old data first)
- `removeFile` - Remove file from index (for deletions)

### Extraction (`extract/`)

**Orchestrator** (`extract/extractFromSourceFile.ts`)
- `extractFromSourceFile` - Orchestrates extraction: nodes first, then edges

**Node Extraction** (`extract/nodes/`)
- `extractNodes` - Extract all node types (File, Function, Class, Method, Interface, TypeAlias, Variable, Property)
- See `extract/nodes/CLAUDE.md` for detailed node extractor documentation

**Edge Extraction** (`extract/edges/`)
- `extractEdges` - Extract all edge types (CONTAINS, IMPORTS, CALLS, EXTENDS, IMPLEMENTS, USES_TYPE)
- See `extract/edges/CLAUDE.md` for detailed edge extractor documentation

### ID Generation (`IdGenerator.ts`)

- `generateNodeId` - Create deterministic node IDs: `{relativePath}:{symbolPath}` (handles Windows paths, overloads)

### Type Text Normalization (`normalizeTypeText.ts`)

- `normalizeTypeText` - Collapse multiline type text to single line for LLM-friendly output

Used by all extractors to normalize TypeScript type annotations (parameters, return types, extends/implements, type aliases, variable types, property types). Replaces `\n`, `\t`, and multiple spaces with single spaces.

## Critical Information

### Node ID Format

Node IDs are deterministic and hierarchical:
- File: `src/utils.ts`
- Function: `src/utils.ts:formatDate`
- Method: `src/models/User.ts:User.validate`
- Property: `src/models/User.ts:User.name`

**Important:** Symbol paths use dots (`.`) to represent nesting, colons (`:`) separate file path from symbol path.

### Extraction Context

Every extraction requires `ExtractionContext`:
```typescript
{
  filePath: string,  // Relative path from project root
  module: string,    // Module name from config
  package: string    // Package name from config
}
```

### Extraction Order

1. **Nodes first** - Extract all symbols from AST
2. **Edges second** - Extract relationships (requires nodes for CONTAINS edges)

This order is critical because edge extraction needs the node list to build CONTAINS edges and symbol maps.

### Edge Types

- `CONTAINS` - File to top-level symbols only (no nested members)
- `IMPORTS` - File to file (tracks imported symbols, type-only imports)
- `CALLS` - Function/method to function/method (tracks call count)
- `EXTENDS` - Class/interface inheritance
- `IMPLEMENTS` - Class implements interface
- `USES_TYPE` - Type references in parameters, returns, properties

### Incremental Updates

- `indexFile` automatically removes old file data before re-indexing
- `removeFile` for deletions (idempotent - no error if file not indexed)
- `indexProject` with `clearFirst: true` for full re-index

### ts-morph Integration

Uses ts-morph for type-aware TypeScript parsing:
- Pass `tsConfigFilePath` for proper type resolution
- Reuse `Project` instance across files for performance
- Skips `node_modules` and `.d.ts` files automatically

## Common Patterns

### Index Single File
```typescript
await indexFile(absolutePath, dbWriter, {
  module: "core",
  package: "utils",
  relativePath: "src/utils/format.ts",
  project: existingProject  // Optional: reuse for performance
});
```

### Index Entire Project
```typescript
const result = await indexProject(config, dbWriter, {
  projectRoot: "/path/to/project",
  clearFirst: true  // Optional: clear DB first
});
// Returns: { filesProcessed, nodesAdded, edgesAdded, durationMs, errors? }
```

### Extract Without Persisting
```typescript
import { extractFromSourceFile } from "./extract/extractFromSourceFile.js";

const result = extractFromSourceFile(sourceFile, context);
// Returns: { nodes, edges, stats }
```

## Test Coverage

- 21 tests for `normalizeTypeText` (whitespace normalization, edge cases)
- 9 tests for `IdGenerator` (ID generation, Windows paths, overloads)
- 36 tests for node extractors in `extract/nodes/` (all node types, colocated tests)
- 19 tests for edge extractors in `extract/edges/` (all edge types, colocated tests)
- 7 tests for `extractFromSourceFile` (orchestration)
- 11 tests for `Ingestion` (public API, incremental updates, FK handling)
