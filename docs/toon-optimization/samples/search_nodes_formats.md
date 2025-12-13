# TOON Format Alternatives for `search_nodes`

This document compares 4 different TOON encoding strategies for the `search_nodes` tool using realistic data from an actual query for `*Node*` interfaces.

## Test Data

Query: `search_nodes` with pattern `*Node*`, nodeType filter `Interface`

**Results: 11 interfaces**

| Name | File | Lines | Extends | Exported |
|------|------|-------|---------|----------|
| BaseNode | src/db/Types.ts | 24-51 | - | yes |
| FunctionNode | src/db/Types.ts | 54-59 | BaseNode | yes |
| ClassNode | src/db/Types.ts | 61-65 | BaseNode | yes |
| MethodNode | src/db/Types.ts | 67-74 | BaseNode | yes |
| InterfaceNode | src/db/Types.ts | 76-79 | BaseNode | yes |
| TypeAliasNode | src/db/Types.ts | 81-84 | BaseNode | yes |
| VariableNode | src/db/Types.ts | 86-90 | BaseNode | yes |
| FileNode | src/db/Types.ts | 92-95 | BaseNode | yes |
| PropertyNode | src/db/Types.ts | 97-102 | BaseNode | yes |
| ParsedNodeId | src/ingestion/IdGenerator.ts | 34-39 | - | yes |
| NodeRow | src/db/sqlite/SqliteReader.ts | 15-26 | - | no |

**Common metadata:**
- module: "ts-graph-mcp"
- package: "main"

---

## Format A: Current Implementation (Full Redundancy)

### Sample Output

```toon
{
  module: ts-graph-mcp
  package: main
  nodes: [
    {
      id: src/db/Types.ts:BaseNode
      type: Interface
      name: BaseNode
      filePath: src/db/Types.ts
      startLine: 24
      endLine: 51
      exported: true
      extends: []
    }
    {
      id: src/db/Types.ts:FunctionNode
      type: Interface
      name: FunctionNode
      filePath: src/db/Types.ts
      startLine: 54
      endLine: 59
      exported: true
      extends: [BaseNode]
    }
    {
      id: src/db/Types.ts:ClassNode
      type: Interface
      name: ClassNode
      filePath: src/db/Types.ts
      startLine: 61
      endLine: 65
      exported: true
      extends: [BaseNode]
    }
    {
      id: src/db/Types.ts:MethodNode
      type: Interface
      name: MethodNode
      filePath: src/db/Types.ts
      startLine: 67
      endLine: 74
      exported: true
      extends: [BaseNode]
    }
    {
      id: src/db/Types.ts:InterfaceNode
      type: Interface
      name: InterfaceNode
      filePath: src/db/Types.ts
      startLine: 76
      endLine: 79
      exported: true
      extends: [BaseNode]
    }
    {
      id: src/db/Types.ts:TypeAliasNode
      type: Interface
      name: TypeAliasNode
      filePath: src/db/Types.ts
      startLine: 81
      endLine: 84
      exported: true
      extends: [BaseNode]
    }
    {
      id: src/db/Types.ts:VariableNode
      type: Interface
      name: VariableNode
      filePath: src/db/Types.ts
      startLine: 86
      endLine: 90
      exported: true
      extends: [BaseNode]
    }
    {
      id: src/db/Types.ts:FileNode
      type: Interface
      name: FileNode
      filePath: src/db/Types.ts
      startLine: 92
      endLine: 95
      exported: true
      extends: [BaseNode]
    }
    {
      id: src/db/Types.ts:PropertyNode
      type: Interface
      name: PropertyNode
      filePath: src/db/Types.ts
      startLine: 97
      endLine: 102
      exported: true
      extends: [BaseNode]
    }
    {
      id: src/ingestion/IdGenerator.ts:ParsedNodeId
      type: Interface
      name: ParsedNodeId
      filePath: src/ingestion/IdGenerator.ts
      startLine: 34
      endLine: 39
      exported: true
      extends: []
    }
    {
      id: src/db/sqlite/SqliteReader.ts:NodeRow
      type: Interface
      name: NodeRow
      filePath: src/db/sqlite/SqliteReader.ts
      startLine: 15
      endLine: 26
      exported: false
      extends: []
    }
  ]
}
```

### Metrics

- **Character count:** 2,088
- **Node count:** 11
- **Avg chars/node:** 189.8

### Information Preservation

| Field | Preserved | Notes |
|-------|-----------|-------|
| id | ✓ | Full ID with file path and symbol |
| name | ✓ | Redundant (derivable from id) |
| filePath | ✓ | Redundant (derivable from id) |
| startLine | ✓ | Required |
| endLine | ✓ | Required |
| type | ✓ | Required (filtered to Interface) |
| module | ✓ | Hoisted to top-level |
| package | ✓ | Hoisted to top-level |
| exported | ✓ | Required |
| extends | ✓ | Type-specific property |

### Redundancy Analysis

**Redundant fields (derivable from `id`):**
- `name`: Always the substring after the last `:` in `id`
- `filePath`: Always the substring before the last `:` in `id`

**Repeated values:**
- `type: Interface` appears 11 times (hoistable)
- `filePath: src/db/Types.ts` appears 9 times
- `exported: true` appears 10 times
- `extends: [BaseNode]` appears 8 times

---

## Format B: Derivable Fields Removed

### Sample Output

```toon
{
  module: ts-graph-mcp
  package: main
  nodes: [
    {
      id: src/db/Types.ts:BaseNode
      type: Interface
      startLine: 24
      endLine: 51
      exported: true
      extends: []
    }
    {
      id: src/db/Types.ts:FunctionNode
      type: Interface
      startLine: 54
      endLine: 59
      exported: true
      extends: [BaseNode]
    }
    {
      id: src/db/Types.ts:ClassNode
      type: Interface
      startLine: 61
      endLine: 65
      exported: true
      extends: [BaseNode]
    }
    {
      id: src/db/Types.ts:MethodNode
      type: Interface
      startLine: 67
      endLine: 74
      exported: true
      extends: [BaseNode]
    }
    {
      id: src/db/Types.ts:InterfaceNode
      type: Interface
      startLine: 76
      endLine: 79
      exported: true
      extends: [BaseNode]
    }
    {
      id: src/db/Types.ts:TypeAliasNode
      type: Interface
      startLine: 81
      endLine: 84
      exported: true
      extends: [BaseNode]
    }
    {
      id: src/db/Types.ts:VariableNode
      type: Interface
      startLine: 86
      endLine: 90
      exported: true
      extends: [BaseNode]
    }
    {
      id: src/db/Types.ts:FileNode
      type: Interface
      startLine: 92
      endLine: 95
      exported: true
      extends: [BaseNode]
    }
    {
      id: src/db/Types.ts:PropertyNode
      type: Interface
      startLine: 97
      endLine: 102
      exported: true
      extends: [BaseNode]
    }
    {
      id: src/ingestion/IdGenerator.ts:ParsedNodeId
      type: Interface
      startLine: 34
      endLine: 39
      exported: true
      extends: []
    }
    {
      id: src/db/sqlite/SqliteReader.ts:NodeRow
      type: Interface
      startLine: 15
      endLine: 26
      exported: false
      extends: []
    }
  ]
}
```

### Metrics

- **Character count:** 1,606
- **Node count:** 11
- **Avg chars/node:** 146.0
- **Reduction from A:** -482 chars (-23.1%)

### Information Preservation

| Field | Preserved | Recovery Method |
|-------|-----------|-----------------|
| id | ✓ | Direct |
| name | ✓ | Parse from `id` (substring after `:`) |
| filePath | ✓ | Parse from `id` (substring before `:`) |
| startLine | ✓ | Direct |
| endLine | ✓ | Direct |
| type | ✓ | Direct |
| module | ✓ | Top-level |
| package | ✓ | Top-level |
| exported | ✓ | Direct |
| extends | ✓ | Direct |

### Pros/Cons

**Pros:**
- 23% size reduction with zero information loss
- Simple recovery (substring split on `:`)
- Maintains full readability of IDs

**Cons:**
- Still repeats `type`, `exported`, and file paths in IDs
- Doesn't leverage file-level grouping

---

## Format C: Hierarchical File Grouping

### Sample Output

```toon
{
  module: ts-graph-mcp
  package: main
  type: Interface
  files: [
    {
      path: src/db/Types.ts
      nodes: [
        {name: BaseNode, lines: 24-51, exported: true, extends: []}
        {name: FunctionNode, lines: 54-59, exported: true, extends: [BaseNode]}
        {name: ClassNode, lines: 61-65, exported: true, extends: [BaseNode]}
        {name: MethodNode, lines: 67-74, exported: true, extends: [BaseNode]}
        {name: InterfaceNode, lines: 76-79, exported: true, extends: [BaseNode]}
        {name: TypeAliasNode, lines: 81-84, exported: true, extends: [BaseNode]}
        {name: VariableNode, lines: 86-90, exported: true, extends: [BaseNode]}
        {name: FileNode, lines: 92-95, exported: true, extends: [BaseNode]}
        {name: PropertyNode, lines: 97-102, exported: true, extends: [BaseNode]}
      ]
    }
    {
      path: src/ingestion/IdGenerator.ts
      nodes: [
        {name: ParsedNodeId, lines: 34-39, exported: true, extends: []}
      ]
    }
    {
      path: src/db/sqlite/SqliteReader.ts
      nodes: [
        {name: NodeRow, lines: 15-26, exported: false, extends: []}
      ]
    }
  ]
}
```

### Metrics

- **Character count:** 931
- **Node count:** 11
- **Avg chars/node:** 84.6
- **Reduction from A:** -1,157 chars (-55.4%)
- **Reduction from B:** -675 chars (-42.0%)

### Information Preservation

| Field | Preserved | Recovery Method |
|-------|-----------|-----------------|
| id | ✓ | Reconstruct from `path:name` |
| name | ✓ | Direct (within file group) |
| filePath | ✓ | File-level `path` field |
| startLine | ✓ | Parse from `lines` range |
| endLine | ✓ | Parse from `lines` range |
| type | ✓ | Top-level (all nodes same type) |
| module | ✓ | Top-level |
| package | ✓ | Top-level |
| exported | ✓ | Direct |
| extends | ✓ | Direct |

### Pros/Cons

**Pros:**
- 55% size reduction from baseline
- Natural file-based organization
- Eliminates file path repetition in IDs
- Compact line range notation (`24-51`)
- Hoists `type` to top-level (single filter result)

**Cons:**
- Requires reconstructing full IDs (`path:name`)
- Assumes single node type per query (not always true)
- Loses at-a-glance ID visibility

---

## Format D: Maximum Compression

### Sample Output

```toon
{
  module: ts-graph-mcp
  package: main
  type: Interface
  exported: true
  files: [
    {
      path: src/db/Types.ts
      extends: BaseNode
      nodes: [
        {name: BaseNode, lines: 24-51, extends: []}
        {name: FunctionNode, lines: 54-59}
        {name: ClassNode, lines: 61-65}
        {name: MethodNode, lines: 67-74}
        {name: InterfaceNode, lines: 76-79}
        {name: TypeAliasNode, lines: 81-84}
        {name: VariableNode, lines: 86-90}
        {name: FileNode, lines: 92-95}
        {name: PropertyNode, lines: 97-102}
      ]
    }
    {
      path: src/ingestion/IdGenerator.ts
      nodes: [
        {name: ParsedNodeId, lines: 34-39, extends: []}
      ]
    }
    {
      path: src/db/sqlite/SqliteReader.ts
      nodes: [
        {name: NodeRow, lines: 15-26, exported: false, extends: []}
      ]
    }
  ]
}
```

### Metrics

- **Character count:** 677
- **Node count:** 11
- **Avg chars/node:** 61.5
- **Reduction from A:** -1,411 chars (-67.6%)
- **Reduction from B:** -929 chars (-57.9%)
- **Reduction from C:** -254 chars (-27.3%)

### Information Preservation

| Field | Preserved | Recovery Method |
|-------|-----------|-----------------|
| id | ✓ | Reconstruct from `path:name` |
| name | ✓ | Direct |
| filePath | ✓ | File-level `path` |
| startLine | ✓ | Parse `lines` start |
| endLine | ✓ | Parse `lines` end |
| type | ✓ | Top-level default |
| module | ✓ | Top-level |
| package | ✓ | Top-level |
| exported | ✓ | Top-level default + overrides |
| extends | ✓ | File-level default + overrides |

### Optimization Techniques

1. **Top-level hoisting:**
   - `type: Interface` (all nodes)
   - `exported: true` (default, override for NodeRow)

2. **File-level hoisting:**
   - `extends: BaseNode` for src/db/Types.ts (8/9 nodes)
   - Only override for BaseNode itself

3. **Default value suppression:**
   - Omit `exported: true` (use top-level default)
   - Omit `extends: [BaseNode]` (use file-level default)
   - Only show exceptions

4. **Compact notation:**
   - Line ranges: `24-51` instead of `startLine: 24, endLine: 51`

### Pros/Cons

**Pros:**
- 68% size reduction from baseline
- 58% reduction from "derivables removed"
- All information recoverable
- Leverages hierarchical structure (project → file → node)
- Exploits common patterns (extends BaseNode)

**Cons:**
- Most complex recovery logic
- Requires multi-level default handling
- Assumes homogeneous result sets (single type, mostly exported)
- Less readable for humans (optimized for tokens)

---

## Comparison Summary

| Format | Chars | Reduction | Chars/Node | Complexity | Human Readable |
|--------|-------|-----------|------------|------------|----------------|
| **A: Current** | 2,088 | baseline | 189.8 | Simple | Excellent |
| **B: No Derivables** | 1,606 | -23.1% | 146.0 | Simple | Excellent |
| **C: Hierarchical** | 931 | -55.4% | 84.6 | Medium | Good |
| **D: Max Compress** | 677 | -67.6% | 61.5 | Complex | Fair |

### Token Impact Estimate

Assuming ~4 chars per token average:

| Format | Estimated Tokens | Token Reduction |
|--------|------------------|-----------------|
| **A: Current** | ~522 | baseline |
| **B: No Derivables** | ~402 | -23.0% |
| **C: Hierarchical** | ~233 | -55.4% |
| **D: Max Compress** | ~169 | -67.6% |

### Recommendations

**For immediate implementation:**
- **Format B** offers 23% reduction with zero complexity cost
- Trivial parsing: `const [filePath, name] = id.split(':')`
- No behavioral changes required

**For maximum efficiency:**
- **Format D** achieves 68% reduction
- Best for large result sets (>50 nodes)
- Requires smart default handling and recovery logic

**Hybrid approach:**
- Use Format B for small results (<20 nodes)
- Use Format D for large results (>50 nodes)
- Switch based on result set size

### Edge Cases to Consider

1. **Mixed node types:** Format C/D assume single type - fails for mixed searches
2. **Multi-file nodes:** All formats handle correctly
3. **No extends:** Formats C/D handle via empty array or omission
4. **Unexported nodes:** Format D handles via override
5. **Single result:** All formats work, but D has high overhead

### Next Steps

1. Implement Format B as quick win (23% reduction, no complexity)
2. Prototype Format D for large result sets
3. Benchmark token usage with real LLM (Claude/GPT)
4. Add format selection heuristics based on result characteristics
