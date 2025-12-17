# Edge Extractors Module

Extracts relationship edges from TypeScript source files using ts-morph AST analysis.

## Public API

Only `extractEdges` is exported from the module:

```typescript
import { extractEdges } from "./extract/edges/extractEdges.js";
```

## Edge Types Extracted

| File | Edge Type | Description |
|------|-----------|-------------|
| `extractContainsEdges.ts` | `CONTAINS` | File → top-level symbols |
| `extractImportEdges.ts` | `IMPORTS` | File → file (tracks symbols, type-only) |
| `extractCallEdges.ts` | `CALLS` | Function/method → function/method (tracks count) |
| `extractInheritanceEdges.ts` | `EXTENDS` | Class/interface → parent |
| `extractInheritanceEdges.ts` | `IMPLEMENTS` | Class → interface |
| `extractTypeUsageEdges.ts` | `USES_TYPE` | Symbol → type (tracks context) |

## Extraction Order

Edges are extracted **after** nodes to maintain a two-pass architecture, though no edge extractor requires a global nodes array for cross-file resolution (import maps handle this).

## Context Interface

All extractors receive `EdgeExtractionContext`:

```typescript
interface EdgeExtractionContext {
  filePath: string;   // Relative path from project root
  module: string;     // Module name from config
  package: string;    // Package name from config
}
```

## Key Implementation Details

### CONTAINS Edges
- Only creates edges for top-level symbols (no nested members)
- Identifies top-level by checking symbol path has no dots
- Extracts directly from AST (no nodes array needed)

### IMPORTS Edges
- Skips external modules (those not starting with `.` or `/`)
- Resolves relative paths to target file using ts-morph
- Tracks `importedSymbols` and `isTypeOnly`
- Extracts directly from AST (no nodes array needed)

### CALLS Edges
- Uses `buildImportMap` to resolve cross-file calls (no global nodes array needed)
- Builds local symbol map from current file's AST
- Counts multiple calls to same target (`callCount`)
- Handles arrow functions, regular functions, and methods

### Type Usage Edges
- Uses `buildImportMap` to resolve cross-file type references (no global nodes array needed)
- Extracts from function parameters, return types
- Extracts from variable and property type annotations
- Filters built-in types (String, Array, Promise, etc.)
- Tracks context: `"parameter"` | `"return"` | `"variable"` | `"property"`

## Import Resolution

Cross-file edges (CALLS, USES_TYPE) use `buildImportMap.ts` for import resolution:
- Uses ts-morph to resolve imports (handles path aliases like `@shared/*`)
- Constructs target node IDs directly: `targetPath:symbolName`
- No global nodes array needed - enables memory-efficient streaming ingestion

## Test Coverage

Each extractor has colocated tests:
- `extractContainsEdges.test.ts` - 2 tests
- `extractImportEdges.test.ts` - 4 tests
- `extractCallEdges.test.ts` - 4 tests
- `extractInheritanceEdges.test.ts` - 5 tests
- `extractTypeUsageEdges.test.ts` - 5 tests
- `extractEdges.test.ts` - 1 integration test
