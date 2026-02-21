# Ingestion Module

Parses TypeScript source code using ts-morph AST and extracts nodes (symbols) and edges (relationships) for storage in the graph database.

## Key Exports

### Public API (`indexProject.ts`)

- `indexProject` - Index entire project based on config (processes all packages)

### Extraction (`extract/`)

**Orchestrator** (`extract/extractFromSourceFile.ts`)
- `extractFromSourceFile` - Orchestrates extraction: nodes first, then edges

**Node Extraction** (`extract/nodes/`)
- `extractNodes` - Extract all node types as `ExtractedNode[]` (without `contentHash`/`snippet`). `indexFile` enriches them into full `Node[]` by adding snippet and contentHash after embedding.
- See `extract/nodes/CLAUDE.md` for detailed node extractor documentation

**Edge Extraction** (`extract/edges/`)
- `extractEdges` - Extract all edge types (CALLS, EXTENDS, IMPLEMENTS, USES_TYPE, REFERENCES, INCLUDES)
- See `extract/edges/CLAUDE.md` for detailed edge extractor documentation

### ID Generation (`generateNodeId.ts`)

- `generateNodeId` - Create deterministic node IDs: `{relativePath}:{symbolPath}` (handles Windows paths, overloads)

### Type Text Normalization (`normalizeTypeText.ts`)

- `normalizeTypeText` - Collapse multiline type text to single line for LLM-friendly output

Used by all extractors to normalize TypeScript type annotations (parameters, return types, extends/implements, type aliases, variable types, property types). Replaces `\n`, `\t`, and multiple spaces with single spaces.

## Critical Information

### Node ID Format

Node IDs are deterministic and hierarchical:
- Function: `src/utils.ts:formatDate`
- Method: `src/models/User.ts:User.validate`
- Property: `src/models/User.ts:User.name`

**Important:** Symbol paths use dots (`.`) to represent nesting, colons (`:`) separate file path from symbol path.

### Extraction Context

`indexFile` requires `EdgeExtractionContext`, which extends the base context with cross-package resolution:
```typescript
{
  filePath: string,        // Relative path from project root
  package: string,         // Package name from config
  projectRegistry?: Map    // Cross-package resolution (monorepos)
}
```

All three callers (`indexProject`, `syncOnStartup`, `watchProject`) pass `EdgeExtractionContext` with `projectRegistry` to enable cross-package edge resolution.

### Extraction Order

1. **Nodes first** - Extract all symbols from AST
2. **Edges second** - Extract relationships using import maps for cross-file resolution

This order maintains a clean two-pass architecture. Edge extraction uses `buildImportMap` for cross-file resolution (no global nodes array needed).

### Edge Types

- `CALLS` - Function/method to function/method (tracks call count)
- `EXTENDS` - Class/interface inheritance
- `IMPLEMENTS` - Class implements interface
- `USES_TYPE` - Type references in parameters, returns, properties
- `REFERENCES` - Function passed as callback or stored
- `INCLUDES` - JSX component usage

### Full Re-index

- `indexProject` with `clearFirst: true` clears DB before indexing

### ts-morph Integration

Uses ts-morph for type-aware TypeScript parsing:
- Pass `tsConfigFilePath` for proper type resolution
- Reuse `Project` instance across files for performance
- Skips `node_modules` and `.d.ts` files automatically

## Common Patterns

### Index Entire Project
```typescript
const result = await indexProject(config, dbWriter, {
  projectRoot: "/path/to/project",
  searchIndex,        // Required: search index for unified indexing
  embeddingProvider,  // Required: embedding provider for semantic search
  clearFirst: true    // Optional: clear DB first
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
