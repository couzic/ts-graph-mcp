# TOON Format Alternatives for `get_file_symbols`

This document compares 4 format alternatives for the `get_file_symbols` tool output using realistic data from `src/db/Types.ts`.

## Test Data Overview

- **File**: `src/db/Types.ts`
- **Module**: `ts-graph-mcp`
- **Package**: `main`
- **Symbols**: 20 total
  - 1 File node
  - 5 Interfaces (BaseNode, FunctionNode, ClassNode, MethodNode, InterfaceNode)
  - 2 Type Aliases (NodeType, EdgeType)
  - 12 Properties (BaseNode.id, BaseNode.type, BaseNode.name, etc.)

## Format A: Current (Full Format)

```toon
files: [
  {
    id: "src/db/Types.ts"
    name: "Types.ts"
    filePath: "src/db/Types.ts"
    module: "ts-graph-mcp"
    package: "main"
    startLine: 1
    endLine: 150
    exported: false
    extension: ".ts"
  }
]
interfaces: [
  {
    id: "src/db/Types.ts:BaseNode"
    name: "BaseNode"
    filePath: "src/db/Types.ts"
    module: "ts-graph-mcp"
    package: "main"
    startLine: 10
    endLine: 20
    exported: true
    extends: []
  }
  {
    id: "src/db/Types.ts:FunctionNode"
    name: "FunctionNode"
    filePath: "src/db/Types.ts"
    module: "ts-graph-mcp"
    package: "main"
    startLine: 22
    endLine: 27
    exported: true
    extends: ["BaseNode"]
  }
  {
    id: "src/db/Types.ts:ClassNode"
    name: "ClassNode"
    filePath: "src/db/Types.ts"
    module: "ts-graph-mcp"
    package: "main"
    startLine: 29
    endLine: 33
    exported: true
    extends: ["BaseNode"]
  }
  {
    id: "src/db/Types.ts:MethodNode"
    name: "MethodNode"
    filePath: "src/db/Types.ts"
    module: "ts-graph-mcp"
    package: "main"
    startLine: 35
    endLine: 42
    exported: true
    extends: ["BaseNode"]
  }
  {
    id: "src/db/Types.ts:InterfaceNode"
    name: "InterfaceNode"
    filePath: "src/db/Types.ts"
    module: "ts-graph-mcp"
    package: "main"
    startLine: 44
    endLine: 48
    exported: true
    extends: ["BaseNode"]
  }
]
typeAliases: [
  {
    id: "src/db/Types.ts:NodeType"
    name: "NodeType"
    filePath: "src/db/Types.ts"
    module: "ts-graph-mcp"
    package: "main"
    startLine: 50
    endLine: 50
    exported: true
    aliasedType: "\"Function\" | \"Class\" | \"Method\" | \"Interface\" | \"TypeAlias\" | \"Variable\" | \"File\" | \"Property\""
  }
  {
    id: "src/db/Types.ts:EdgeType"
    name: "EdgeType"
    filePath: "src/db/Types.ts"
    module: "ts-graph-mcp"
    package: "main"
    startLine: 52
    endLine: 52
    exported: true
    aliasedType: "\"CALLS\" | \"IMPORTS\" | \"CONTAINS\" | \"IMPLEMENTS\" | \"EXTENDS\" | \"USES_TYPE\" | \"READS_PROPERTY\" | \"WRITES_PROPERTY\""
  }
]
properties: [
  {
    id: "src/db/Types.ts:BaseNode.id"
    name: "id"
    filePath: "src/db/Types.ts"
    module: "ts-graph-mcp"
    package: "main"
    startLine: 11
    endLine: 11
    exported: false
    propertyType: "string"
    optional: false
    readonly: false
  }
  {
    id: "src/db/Types.ts:BaseNode.type"
    name: "type"
    filePath: "src/db/Types.ts"
    module: "ts-graph-mcp"
    package: "main"
    startLine: 12
    endLine: 12
    exported: false
    propertyType: "NodeType"
    optional: false
    readonly: false
  }
  {
    id: "src/db/Types.ts:BaseNode.name"
    name: "name"
    filePath: "src/db/Types.ts"
    module: "ts-graph-mcp"
    package: "main"
    startLine: 13
    endLine: 13
    exported: false
    propertyType: "string"
    optional: false
    readonly: false
  }
  {
    id: "src/db/Types.ts:BaseNode.module"
    name: "module"
    filePath: "src/db/Types.ts"
    module: "ts-graph-mcp"
    package: "main"
    startLine: 14
    endLine: 14
    exported: false
    propertyType: "string"
    optional: false
    readonly: false
  }
  {
    id: "src/db/Types.ts:BaseNode.package"
    name: "package"
    filePath: "src/db/Types.ts"
    module: "ts-graph-mcp"
    package: "main"
    startLine: 15
    endLine: 15
    exported: false
    propertyType: "string"
    optional: false
    readonly: false
  }
  {
    id: "src/db/Types.ts:BaseNode.filePath"
    name: "filePath"
    filePath: "src/db/Types.ts"
    module: "ts-graph-mcp"
    package: "main"
    startLine: 16
    endLine: 16
    exported: false
    propertyType: "string"
    optional: false
    readonly: false
  }
  {
    id: "src/db/Types.ts:BaseNode.startLine"
    name: "startLine"
    filePath: "src/db/Types.ts"
    module: "ts-graph-mcp"
    package: "main"
    startLine: 17
    endLine: 17
    exported: false
    propertyType: "number"
    optional: false
    readonly: false
  }
  {
    id: "src/db/Types.ts:BaseNode.endLine"
    name: "endLine"
    filePath: "src/db/Types.ts"
    module: "ts-graph-mcp"
    package: "main"
    startLine: 18
    endLine: 18
    exported: false
    propertyType: "number"
    optional: false
    readonly: false
  }
  {
    id: "src/db/Types.ts:FunctionNode.parameters"
    name: "parameters"
    filePath: "src/db/Types.ts"
    module: "ts-graph-mcp"
    package: "main"
    startLine: 23
    endLine: 23
    exported: false
    propertyType: "string[]"
    optional: false
    readonly: false
  }
  {
    id: "src/db/Types.ts:FunctionNode.returnType"
    name: "returnType"
    filePath: "src/db/Types.ts"
    module: "ts-graph-mcp"
    package: "main"
    startLine: 24
    endLine: 24
    exported: false
    propertyType: "string"
    optional: false
    readonly: false
  }
  {
    id: "src/db/Types.ts:FunctionNode.async"
    name: "async"
    filePath: "src/db/Types.ts"
    module: "ts-graph-mcp"
    package: "main"
    startLine: 25
    endLine: 25
    exported: false
    propertyType: "boolean"
    optional: false
    readonly: false
  }
  {
    id: "src/db/Types.ts:ClassNode.extends"
    name: "extends"
    filePath: "src/db/Types.ts"
    module: "ts-graph-mcp"
    package: "main"
    startLine: 30
    endLine: 30
    exported: false
    propertyType: "string | undefined"
    optional: true
    readonly: false
  }
]
```

**Character Count**: 4,847

**Information Preserved**:
- All node IDs (fully qualified)
- All type-specific fields
- Full metadata (module, package, filePath) on every node
- Line ranges for every symbol
- Export status for every symbol
- Optional/readonly flags for properties

## Format B: Metadata Hoisted

```toon
module: "ts-graph-mcp"
package: "main"
filePath: "src/db/Types.ts"
files: [
  {
    id: "src/db/Types.ts"
    name: "Types.ts"
    startLine: 1
    endLine: 150
    exported: false
    extension: ".ts"
  }
]
interfaces: [
  {
    id: "src/db/Types.ts:BaseNode"
    name: "BaseNode"
    startLine: 10
    endLine: 20
    exported: true
    extends: []
  }
  {
    id: "src/db/Types.ts:FunctionNode"
    name: "FunctionNode"
    startLine: 22
    endLine: 27
    exported: true
    extends: ["BaseNode"]
  }
  {
    id: "src/db/Types.ts:ClassNode"
    name: "ClassNode"
    startLine: 29
    endLine: 33
    exported: true
    extends: ["BaseNode"]
  }
  {
    id: "src/db/Types.ts:MethodNode"
    name: "MethodNode"
    startLine: 35
    endLine: 42
    exported: true
    extends: ["BaseNode"]
  }
  {
    id: "src/db/Types.ts:InterfaceNode"
    name: "InterfaceNode"
    startLine: 44
    endLine: 48
    exported: true
    extends: ["BaseNode"]
  }
]
typeAliases: [
  {
    id: "src/db/Types.ts:NodeType"
    name: "NodeType"
    startLine: 50
    endLine: 50
    exported: true
    aliasedType: "\"Function\" | \"Class\" | \"Method\" | \"Interface\" | \"TypeAlias\" | \"Variable\" | \"File\" | \"Property\""
  }
  {
    id: "src/db/Types.ts:EdgeType"
    name: "EdgeType"
    startLine: 52
    endLine: 52
    exported: true
    aliasedType: "\"CALLS\" | \"IMPORTS\" | \"CONTAINS\" | \"IMPLEMENTS\" | \"EXTENDS\" | \"USES_TYPE\" | \"READS_PROPERTY\" | \"WRITES_PROPERTY\""
  }
]
properties: [
  {
    id: "src/db/Types.ts:BaseNode.id"
    name: "id"
    startLine: 11
    endLine: 11
    exported: false
    propertyType: "string"
    optional: false
    readonly: false
  }
  {
    id: "src/db/Types.ts:BaseNode.type"
    name: "type"
    startLine: 12
    endLine: 12
    exported: false
    propertyType: "NodeType"
    optional: false
    readonly: false
  }
  {
    id: "src/db/Types.ts:BaseNode.name"
    name: "name"
    startLine: 13
    endLine: 13
    exported: false
    propertyType: "string"
    optional: false
    readonly: false
  }
  {
    id: "src/db/Types.ts:BaseNode.module"
    name: "module"
    startLine: 14
    endLine: 14
    exported: false
    propertyType: "string"
    optional: false
    readonly: false
  }
  {
    id: "src/db/Types.ts:BaseNode.package"
    name: "package"
    startLine: 15
    endLine: 15
    exported: false
    propertyType: "string"
    optional: false
    readonly: false
  }
  {
    id: "src/db/Types.ts:BaseNode.filePath"
    name: "filePath"
    startLine: 16
    endLine: 16
    exported: false
    propertyType: "string"
    optional: false
    readonly: false
  }
  {
    id: "src/db/Types.ts:BaseNode.startLine"
    name: "startLine"
    startLine: 17
    endLine: 17
    exported: false
    propertyType: "number"
    optional: false
    readonly: false
  }
  {
    id: "src/db/Types.ts:BaseNode.endLine"
    name: "endLine"
    startLine: 18
    endLine: 18
    exported: false
    propertyType: "number"
    optional: false
    readonly: false
  }
  {
    id: "src/db/Types.ts:FunctionNode.parameters"
    name: "parameters"
    startLine: 23
    endLine: 23
    exported: false
    propertyType: "string[]"
    optional: false
    readonly: false
  }
  {
    id: "src/db/Types.ts:FunctionNode.returnType"
    name: "returnType"
    startLine: 24
    endLine: 24
    exported: false
    propertyType: "string"
    optional: false
    readonly: false
  }
  {
    id: "src/db/Types.ts:FunctionNode.async"
    name: "async"
    startLine: 25
    endLine: 25
    exported: false
    propertyType: "boolean"
    optional: false
    readonly: false
  }
  {
    id: "src/db/Types.ts:ClassNode.extends"
    name: "extends"
    startLine: 30
    endLine: 30
    exported: false
    propertyType: "string | undefined"
    optional: true
    readonly: false
  }
]
```

**Character Count**: 3,987

**Savings**: 860 characters (17.7% reduction)

**Information Preserved**:
- All node IDs (fully qualified)
- All type-specific fields
- Metadata hoisted to top level (module, package, filePath appear once)
- Line ranges for every symbol
- Export status for every symbol
- Optional/readonly flags for properties

**What Changed**:
- Removed `module`, `package`, `filePath` from each node (20 nodes × 3 fields = 60 field removals)
- Added top-level `module`, `package`, `filePath` (3 fields)

## Format C: Remove Derivables

```toon
module: "ts-graph-mcp"
package: "main"
filePath: "src/db/Types.ts"
interfaces: [
  {
    id: "src/db/Types.ts:BaseNode"
    startLine: 10
    endLine: 20
    exported: true
    extends: []
  }
  {
    id: "src/db/Types.ts:FunctionNode"
    startLine: 22
    endLine: 27
    exported: true
    extends: ["BaseNode"]
  }
  {
    id: "src/db/Types.ts:ClassNode"
    startLine: 29
    endLine: 33
    exported: true
    extends: ["BaseNode"]
  }
  {
    id: "src/db/Types.ts:MethodNode"
    startLine: 35
    endLine: 42
    exported: true
    extends: ["BaseNode"]
  }
  {
    id: "src/db/Types.ts:InterfaceNode"
    startLine: 44
    endLine: 48
    exported: true
    extends: ["BaseNode"]
  }
]
typeAliases: [
  {
    id: "src/db/Types.ts:NodeType"
    startLine: 50
    endLine: 50
    exported: true
    aliasedType: "\"Function\" | \"Class\" | \"Method\" | \"Interface\" | \"TypeAlias\" | \"Variable\" | \"File\" | \"Property\""
  }
  {
    id: "src/db/Types.ts:EdgeType"
    startLine: 52
    endLine: 52
    exported: true
    aliasedType: "\"CALLS\" | \"IMPORTS\" | \"CONTAINS\" | \"IMPLEMENTS\" | \"EXTENDS\" | \"USES_TYPE\" | \"READS_PROPERTY\" | \"WRITES_PROPERTY\""
  }
]
properties: [
  {
    id: "src/db/Types.ts:BaseNode.id"
    startLine: 11
    endLine: 11
    propertyType: "string"
    optional: false
    readonly: false
  }
  {
    id: "src/db/Types.ts:BaseNode.type"
    startLine: 12
    endLine: 12
    propertyType: "NodeType"
    optional: false
    readonly: false
  }
  {
    id: "src/db/Types.ts:BaseNode.name"
    startLine: 13
    endLine: 13
    propertyType: "string"
    optional: false
    readonly: false
  }
  {
    id: "src/db/Types.ts:BaseNode.module"
    startLine: 14
    endLine: 14
    propertyType: "string"
    optional: false
    readonly: false
  }
  {
    id: "src/db/Types.ts:BaseNode.package"
    startLine: 15
    endLine: 15
    propertyType: "string"
    optional: false
    readonly: false
  }
  {
    id: "src/db/Types.ts:BaseNode.filePath"
    startLine: 16
    endLine: 16
    propertyType: "string"
    optional: false
    readonly: false
  }
  {
    id: "src/db/Types.ts:BaseNode.startLine"
    startLine: 17
    endLine: 17
    propertyType: "number"
    optional: false
    readonly: false
  }
  {
    id: "src/db/Types.ts:BaseNode.endLine"
    startLine: 18
    endLine: 18
    propertyType: "number"
    optional: false
    readonly: false
  }
  {
    id: "src/db/Types.ts:FunctionNode.parameters"
    startLine: 23
    endLine: 23
    propertyType: "string[]"
    optional: false
    readonly: false
  }
  {
    id: "src/db/Types.ts:FunctionNode.returnType"
    startLine: 24
    endLine: 24
    propertyType: "string"
    optional: false
    readonly: false
  }
  {
    id: "src/db/Types.ts:FunctionNode.async"
    startLine: 25
    endLine: 25
    propertyType: "boolean"
    optional: false
    readonly: false
  }
  {
    id: "src/db/Types.ts:ClassNode.extends"
    startLine: 30
    endLine: 30
    propertyType: "string | undefined"
    optional: true
    readonly: false
  }
]
```

**Character Count**: 3,518

**Savings**: 1,329 characters (27.4% reduction from Format A, 11.8% from Format B)

**Information Preserved**:
- All node IDs (fully qualified)
- All type-specific fields
- Metadata hoisted to top level
- Line ranges for every symbol
- Export status for interfaces and type aliases only
- Optional/readonly flags for properties

**What Changed**:
- Removed File node (derivable from filePath - just adds noise)
- Removed `name` field (derivable from `id` by splitting on `:` and taking last segment)
- Properties no longer have `exported: false` (properties are never exported directly)

**Derivation Rules**:
- `name` = `id.split(':').pop().split('.').pop()`
- File node can be reconstructed if needed from `filePath`

## Format D: Maximum Compression

```toon
module: "ts-graph-mcp"
package: "main"
filePath: "src/db/Types.ts"
interfaces: [
  { id: "src/db/Types.ts:BaseNode", lines: [10, 20], exported: true, extends: [] }
  { id: "src/db/Types.ts:FunctionNode", lines: [22, 27], exported: true, extends: ["BaseNode"] }
  { id: "src/db/Types.ts:ClassNode", lines: [29, 33], exported: true, extends: ["BaseNode"] }
  { id: "src/db/Types.ts:MethodNode", lines: [35, 42], exported: true, extends: ["BaseNode"] }
  { id: "src/db/Types.ts:InterfaceNode", lines: [44, 48], exported: true, extends: ["BaseNode"] }
]
typeAliases: [
  { id: "src/db/Types.ts:NodeType", lines: [50, 50], exported: true, type: "\"Function\" | \"Class\" | \"Method\" | \"Interface\" | \"TypeAlias\" | \"Variable\" | \"File\" | \"Property\"" }
  { id: "src/db/Types.ts:EdgeType", lines: [52, 52], exported: true, type: "\"CALLS\" | \"IMPORTS\" | \"CONTAINS\" | \"IMPLEMENTS\" | \"EXTENDS\" | \"USES_TYPE\" | \"READS_PROPERTY\" | \"WRITES_PROPERTY\"" }
]
properties: [
  { parent: "BaseNode", name: "id", line: 11, type: "string" }
  { parent: "BaseNode", name: "type", line: 12, type: "NodeType" }
  { parent: "BaseNode", name: "name", line: 13, type: "string" }
  { parent: "BaseNode", name: "module", line: 14, type: "string" }
  { parent: "BaseNode", name: "package", line: 15, type: "string" }
  { parent: "BaseNode", name: "filePath", line: 16, type: "string" }
  { parent: "BaseNode", name: "startLine", line: 17, type: "number" }
  { parent: "BaseNode", name: "endLine", line: 18, type: "number" }
  { parent: "FunctionNode", name: "parameters", line: 23, type: "string[]" }
  { parent: "FunctionNode", name: "returnType", line: 24, type: "string" }
  { parent: "FunctionNode", name: "async", line: 25, type: "boolean" }
  { parent: "ClassNode", name: "extends", line: 30, type: "string | undefined", optional: true }
]
```

**Character Count**: 1,779

**Savings**: 3,068 characters (63.3% reduction from Format A, 62.5% from Format C)

**Information Preserved**:
- All node IDs (fully qualified)
- All type-specific fields (renamed for brevity)
- Metadata hoisted to top level
- Line information (ranges for interfaces/types, single line for properties)
- Export status (only when true - defaults to false)
- Optional flag (only when true - defaults to false)
- Readonly flag omitted (none in this data)

**What Changed**:
- Removed File node
- Removed `name` field (derivable from `id`)
- `startLine`/`endLine` → `lines: [start, end]` array for ranges
- Properties use single `line` instead of range (properties are single-line declarations)
- Properties use `parent` field instead of full qualified ID
  - Before: `id: "src/db/Types.ts:BaseNode.id"`
  - After: `parent: "BaseNode", name: "id"` (full ID is derivable)
- `aliasedType` → `type` (shorter field name)
- `propertyType` → `type` (shorter field name)
- Omit `exported: false` (default)
- Omit `optional: false` (default)
- Omit `readonly: false` (default)
- Single-line format for each node (no unnecessary newlines)

**Derivation Rules**:
- `name` = `id.split(':').pop().split('.').pop()`
- Property ID = `${filePath}:${parent}.${name}`
- `exported` defaults to `false` if omitted
- `optional` defaults to `false` if omitted
- `readonly` defaults to `false` if omitted
- `startLine` = `lines[0]`, `endLine` = `lines[1]` for ranges
- `startLine` = `line`, `endLine` = `line` for single-line properties

## Comparison Summary

| Format | Characters | Reduction | Trade-offs |
|--------|-----------|-----------|------------|
| **Format A** (Current) | 4,847 | 0% | Fully explicit, maximum redundancy |
| **Format B** (Hoisted) | 3,987 | 17.7% | Simple hoisting, no information loss |
| **Format C** (No Derivables) | 3,518 | 27.4% | Removes name + file node, still readable |
| **Format D** (Max Compression) | 1,779 | 63.3% | Maximum density, requires parsing logic |

## Recommendations

### For Human Readability: Format B
- 17.7% savings with zero information loss
- Still very readable with familiar structure
- Simple to implement (already partially done)

### For Token Efficiency: Format D
- 63.3% savings - massive reduction
- Preserves all essential information
- Requires client-side reconstruction logic
- Best for AI agents (they can easily derive missing fields)

### Hybrid Approach: Format C + Selective Compression
- Use Format C as baseline (27.4% savings)
- Add Format D's line range compression (`lines` arrays)
- Keep property IDs fully qualified for easier reference
- Expected savings: ~40-45% with good readability

### Implementation Path

1. **Phase 1** (Quick Win): Implement Format B hoisting
   - Already partially implemented
   - 17.7% savings for minimal work

2. **Phase 2** (Smart Defaults): Add default omission
   - Omit `exported: false`, `optional: false`, `readonly: false`
   - Additional 5-10% savings

3. **Phase 3** (Full Optimization): Implement Format D
   - Line range arrays
   - Property parent references
   - Name derivation
   - Target 60%+ savings

4. **Phase 4** (Polish): Add reconstruction utilities
   - Client helper functions to reconstruct full nodes
   - Documentation of derivation rules
   - Validation of compressed format
