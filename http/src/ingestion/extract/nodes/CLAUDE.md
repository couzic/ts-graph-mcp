# Node Extractors Module

Extracts symbol nodes from TypeScript source files using ts-morph AST analysis.

## Public API

Only `extractNodes` is exported from the module:

```typescript
import { extractNodes } from "./extract/nodes/extractNodes.js";
```

## Node Types Extracted

| File | Node Type | Properties |
|------|-----------|------------|
| `extractFunctionNodes.ts` | `Function` | `parameters[]`, `returnType`, `async` |
| `extractArrowFunctionNodes.ts` | `Function` | Arrow functions assigned to variables |
| `extractObjectLiteralMethodNodes.ts` | `Function` | Methods in object literals (`const obj = { method() {} }`) |
| `extractClassNodes.ts` | `Class` | `extends`, `implements[]` |
| `extractMethodNodes.ts` | `Method` | `parameters[]`, `returnType`, `async`, `visibility`, `static` |
| `extractInterfaceNodes.ts` | `Interface` | `extends[]` |
| `extractTypeAliasNodes.ts` | `TypeAlias` | `aliasedType` |
| `extractVariableNodes.ts` | `Variable` | `isConst` |

**Notes:**
- Properties are intentionally NOT extracted. They add noise to search results and slow down indexing without providing useful graph traversal paths. Property types are captured via `HAS_PROPERTY` edges instead.
- Object literal methods use qualified IDs: `file.ts:objectName.methodName`

## Extraction Order

The `extractNodes` orchestrator processes in this order:

1. **Functions** - Top-level functions
2. **Arrow functions** - Arrow functions assigned to variables
3. **Classes** - Then their methods
4. **Interfaces** - Interface declarations only
5. **Type aliases** - Top-level type definitions
6. **Variables** - Top-level variable declarations
7. **Object literal methods** - Methods inside object literals

## Context Interface

All extractors receive `NodeExtractionContext`:

```typescript
interface NodeExtractionContext {
  filePath: string;   // Relative path from project root
  package: string;    // Package name from config
}
```

## Key Implementation Details

### ID Generation

All extractors use `generateNodeId()` from `generateNodeId.ts`:

- Top-level symbols: `generateNodeId(filePath, name)` → `src/utils.ts:formatDate`
- Class members: `generateNodeId(filePath, className, name)` → `src/models/User.ts:User.save`

### Type Text Normalization

All extractors use `normalizeTypeText()` for type annotations:

- Collapses multiline types to single line
- Used for: parameters, return types, extends/implements, variable types

### Method Visibility

`extractMethodNodes` extracts visibility from TypeScript modifiers:
- `public` (default if no modifier)
- `private` (has `PrivateKeyword`)
- `protected` (has `ProtectedKeyword`)

### Exported Flag

Each extractor sets `exported` appropriately:
- Top-level symbols: `isExported()` from ts-morph
- Class methods: always `false` (not directly exportable)

## Utilities

### `normalizeTypeText.ts`
Collapses multiline TypeScript types to single line for LLM-friendly output. Handles `undefined` input gracefully.

### `NodeExtractionContext.ts`
Type definition for context passed to all extractors.

## Test Coverage

Each extractor has colocated tests:
- `extractFunctionNodes.test.ts` - Function extraction with async, parameters, return types
- `extractArrowFunctionNodes.test.ts` - Arrow function extraction
- `extractObjectLiteralMethodNodes.test.ts` - Object literal method extraction
- `extractClassNodes.test.ts` - Class extraction with extends, implements
- `extractMethodNodes.test.ts` - Method visibility, static, async
- `extractInterfaceNodes.test.ts` - Interface extends
- `extractTypeAliasNodes.test.ts` - Type alias extraction
- `extractVariableNodes.test.ts` - Variable const detection
- `extractNodes.test.ts` - Integration test for full extraction
- `normalizeTypeText.test.ts` - Whitespace normalization edge cases
