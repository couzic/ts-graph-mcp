# Edge Extractors Module

Extracts relationship edges from TypeScript source files using ts-morph AST analysis.

## Design Principle: Transparent Re-exports

**Re-exports are completely invisible in the graph.** Edges point directly to actual definitions.

```typescript
// X.ts imports from barrel file
import { formatValue } from './index';  // barrel re-exports from helper.ts
formatValue();
```

Graph shows: `X.ts --CALLS--> src/utils/helper.ts:formatValue`

**NOT:** `X.ts --CALLS--> src/index.ts:...` (barrel file is invisible)

This is achieved by `buildImportMap.ts` + `followAliasChain()` which resolve through re-export chains at indexing time.

## Public API

Only `extractEdges` is exported from the module:

```typescript
import { extractEdges } from "./extract/edges/extractEdges.js";
```

## Edge Types Extracted

| File | Edge Type | Description |
|------|-----------|-------------|
| `extractCallEdges.ts` | `CALLS` | Function/method → function/method (tracks count) |
| `extractInheritanceEdges.ts` | `EXTENDS` | Class/interface → parent |
| `extractInheritanceEdges.ts` | `IMPLEMENTS` | Class → interface |
| `extractTakesReturnsEdges.ts` | `TAKES` | Function/method → parameter type |
| `extractTakesReturnsEdges.ts` | `RETURNS` | Function/method → return type |
| `extractHasTypeEdges.ts` | `HAS_TYPE` | Variable → its type |
| `extractHasPropertyEdges.ts` | `HAS_PROPERTY` | Class/interface/object → property type |
| `extractTypeAliasEdges.ts` | `DERIVES_FROM` | Type alias → base type (intersection/union) |
| `extractTypeAliasEdges.ts` | `ALIAS_FOR` | Type alias → aliased type (direct alias) |
| `extractReferenceEdges.ts` | `REFERENCES` | Symbol → symbol (function passed/stored, tracks referenceContext) |

## Extraction Order

Edges are extracted **after** nodes to maintain a two-pass architecture, though no edge extractor requires a global nodes array for cross-file resolution (import maps handle this).

## Context Interface

All extractors receive `EdgeExtractionContext`:

```typescript
interface EdgeExtractionContext {
  filePath: string;   // Relative path from project root
  package: string;    // Package name from config
}
```

## Key Implementation Details

### CALLS Edges
- Uses `buildImportMap` to resolve cross-file calls (no global nodes array needed)
- Builds local symbol map from current file's AST
- Counts multiple calls to same target (`callCount`)
- Handles arrow functions, regular functions, and methods

### Type Signature Edges (TAKES/RETURNS/HAS_TYPE/HAS_PROPERTY/DERIVES_FROM/ALIAS_FOR)
- **TAKES**: Extracts from function/method parameter types
- **RETURNS**: Extracts from function/method return types
- **HAS_TYPE**: Extracts from variable type annotations
- **HAS_PROPERTY**: Extracts from class/interface/object literal property types
- **DERIVES_FROM**: Extracts from type alias intersection/union composition
- **ALIAS_FOR**: Extracts from direct type aliases
- All use `buildImportMap` to resolve cross-file type references
- Filter built-in types (String, Array, Promise, Partial, etc.)
- Extract inner types from generic wrappers (e.g., `Promise<User>` → edge to `User`)
- Handle union types with multiple edges (e.g., `User | Admin` → edges to both)

### REFERENCES Edges
- Captures when functions are **passed or stored** (not directly invoked)
- Patterns: callback arguments, object properties, array elements, return values, variable assignments, variable access
- Uses `buildImportMap` for cross-file resolution
- Tracks referenceContext: `"callback"` | `"property"` | `"array"` | `"return"` | `"assignment"` | `"access"`
- Enables multi-hop path finding through intermediate storage (e.g., `dispatch → userFormatters → formatCustomer`)

## Import Resolution

Cross-file edges (CALLS, USES_TYPE) use `buildImportMap.ts` for import resolution:
- Uses ts-morph to resolve imports (handles path aliases like `@shared/*`)
- Constructs target node IDs directly: `targetPath:symbolName`
- No global nodes array needed - enables memory-efficient streaming ingestion

### Re-export Chain Resolution

Barrel files (`index.ts`) re-export symbols from other files. `buildImportMap.ts` follows these chains to find actual definitions:

```typescript
// libs/toolkit/src/index.ts
export * from "./helpers";  // re-exports clamp

// libs/toolkit/src/helpers.ts
export function clamp() { ... }  // actual definition
```

`followAliasChain()` (in `followAliasChain.ts`) iteratively calls `getAliasedSymbol()` until reaching the actual definition.

### Namespace Import Resolution

`extractCallEdges.ts` handles namespace imports like `MathUtils.multiply()`:

```typescript
import { MathUtils } from "@libs/toolkit";  // namespace re-export
MathUtils.multiply(a, b);  // resolves to actual definition
```

`resolveCallTarget()` uses ts-morph's type system to resolve through the namespace to the actual function definition, filtering out built-in types (declarations outside project root or in `node_modules/`).

## Test Coverage

Each extractor has colocated tests:
- `extractCallEdges.test.ts` - Call edge extraction
- `extractInheritanceEdges.test.ts` - EXTENDS/IMPLEMENTS edges
- `extractTakesReturnsEdges.test.ts` - TAKES/RETURNS edges
- `extractHasTypeEdges.test.ts` - HAS_TYPE edges
- `extractHasPropertyEdges.test.ts` - HAS_PROPERTY edges
- `extractTypeAliasEdges.test.ts` - DERIVES_FROM/ALIAS_FOR edges
- `extractReferenceEdges.test.ts` - Function reference edges
- `extractEdges.test.ts` - Integration test
