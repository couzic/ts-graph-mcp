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

Edges are extracted **after** nodes because:
- `CONTAINS` edges need the node list to identify top-level symbols
- `CALLS` edges need a symbol map built from nodes

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

### IMPORTS Edges
- Skips external modules (those not starting with `.` or `/`)
- Resolves relative paths to target file
- Tracks `importedSymbols` and `isTypeOnly`

### CALLS Edges
- Builds a symbol map from nodes for call resolution
- Counts multiple calls to same target (`callCount`)
- Handles arrow functions, regular functions, and methods

### Type Usage Edges
- Extracts from function parameters, return types
- Extracts from variable and property type annotations
- Filters built-in types (String, Array, Promise, etc.)
- Tracks context: `"parameter"` | `"return"` | `"variable"` | `"property"`

## Test Coverage

Each extractor has colocated tests:
- `extractContainsEdges.test.ts` - 2 tests
- `extractImportEdges.test.ts` - 4 tests
- `extractCallEdges.test.ts` - 3 tests
- `extractInheritanceEdges.test.ts` - 5 tests
- `extractTypeUsageEdges.test.ts` - 4 tests
- `extractEdges.test.ts` - 1 integration test
