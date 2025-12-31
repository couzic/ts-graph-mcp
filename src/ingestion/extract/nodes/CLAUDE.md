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
| `extractFileNode.ts` | `File` | `extension` |
| `extractFunctionNodes.ts` | `Function` | `parameters[]`, `returnType`, `async` |
| `extractClassNodes.ts` | `Class` | `extends`, `implements[]` |
| `extractMethodNodes.ts` | `Method` | `parameters[]`, `returnType`, `async`, `visibility`, `static` |
| `extractInterfaceNodes.ts` | `Interface` | `extends[]` |
| `extractTypeAliasNodes.ts` | `TypeAlias` | `aliasedType` |
| `extractVariableNodes.ts` | `Variable` | `variableType`, `isConst` |
| `extractPropertyNodes.ts` | `Property` | `propertyType`, `optional`, `readonly` |

## Extraction Order

The `extractNodes` orchestrator processes in this order:

1. **File node** - Always first
2. **Functions** - Top-level functions
3. **Classes** - Then their methods and properties
4. **Interfaces** - Then their properties
5. **Type aliases** - Top-level type definitions
6. **Variables** - Top-level variable declarations

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
- Interface members: same pattern as class members

### Type Text Normalization

All extractors use `normalizeTypeText()` for type annotations:

- Collapses multiline types to single line
- Used for: parameters, return types, extends/implements, variable types, property types

### Member Extraction Pattern

Class and interface members are extracted **separately** from their parent:

```typescript
// In extractNodes.ts
const classes = extractClassNodes(sourceFile, context);
for (const classNode of classes) {
  nodes.push(classNode);
  const classDecl = sourceFile.getClasses().find(c => c.getName() === classNode.name);
  if (classDecl) {
    nodes.push(...extractMethodNodes(classDecl, context));
    nodes.push(...extractPropertyNodes(classDecl, context));
  }
}
```

This design:
- Keeps each extractor focused on one node type
- Allows reuse of `extractPropertyNodes` for both classes and interfaces
- Produces flat node array (no nested structure)

### Method Visibility

`extractMethodNodes` extracts visibility from TypeScript modifiers:
- `public` (default if no modifier)
- `private` (has `PrivateKeyword`)
- `protected` (has `ProtectedKeyword`)

### Exported Flag

Each extractor sets `exported` appropriately:
- Top-level symbols: `isExported()` from ts-morph
- Class/interface members: always `false` (not directly exportable)

## Utilities

### `normalizeTypeText.ts`
Collapses multiline TypeScript types to single line for LLM-friendly output. Handles `undefined` input gracefully.

### `NodeExtractionContext.ts`
Type definition for context passed to all extractors.

## Test Coverage

Each extractor has colocated tests (61 tests total):
- `extractFileNode.test.ts` - File node extraction
- `extractFunctionNodes.test.ts` - Function extraction with async, parameters, return types
- `extractClassNodes.test.ts` - Class extraction with extends, implements
- `extractMethodNodes.test.ts` - Method visibility, static, async
- `extractInterfaceNodes.test.ts` - Interface extends
- `extractTypeAliasNodes.test.ts` - Type alias extraction
- `extractVariableNodes.test.ts` - Variable types, const detection
- `extractPropertyNodes.test.ts` - Property extraction from classes and interfaces
- `extractNodes.test.ts` - Integration test for full extraction
- `normalizeTypeText.test.ts` - Whitespace normalization edge cases
