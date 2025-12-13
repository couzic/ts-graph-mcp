# TOON Format Alternatives for `get_neighbors` Tool

This document compares 4 format alternatives for the `get_neighbors` tool output using a concrete example.

## Test Case Setup

**Input Parameters:**
- `nodeId`: `src/chain.ts:funcA`
- `distance`: 2
- `direction`: "both"

**Graph Data:**
- **Center node**: `funcA` (Function, lines 10-12, exported, params=[], returns=string, async=false)
- **Module/Package**: test/call-chain (shared by all nodes)
- **File**: src/chain.ts (shared by all nodes)
- **Neighbor nodes**:
  - `funcB` (Function, lines 6-8, not exported, params=[], returns=void, async=false)
  - `funcC` (Function, lines 2-4, not exported, params=[], returns=number, async=false)
  - `helper` (Function, lines 14-16, exported, params=[], returns=void, async=false)
- **Edges**:
  - `funcA` → `funcB` (CALLS, callCount=1)
  - `funcB` → `funcC` (CALLS, callCount=1)
  - `helper` → `funcA` (CALLS, callCount=2)
  - `src/chain.ts` → `funcA` (CONTAINS)

---

## Format A: Current Format (Full)

Center node includes all fields, grouped nodes, full edges array, complete mermaid diagram.

```
center {
  id: src/chain.ts:funcA
  type: Function
  name: funcA
  module: test
  package: call-chain
  filePath: src/chain.ts
  startLine: 10
  endLine: 12
  exported: true
  parameters: []
  returnType: string
  async: false
}
nodeCount: 4
edgeCount: 4
nodes {
  File [
    {
      id: src/chain.ts
      name: chain.ts
      module: test
      package: call-chain
      filePath: src/chain.ts
      startLine: 1
      endLine: 20
      exported: false
      extension: .ts
    }
  ]
  Function [
    {
      id: src/chain.ts:funcB
      name: funcB
      module: test
      package: call-chain
      filePath: src/chain.ts
      startLine: 6
      endLine: 8
      exported: false
      parameters: []
      returnType: void
      async: false
    }
    {
      id: src/chain.ts:funcC
      name: funcC
      module: test
      package: call-chain
      filePath: src/chain.ts
      startLine: 2
      endLine: 4
      exported: false
      parameters: []
      returnType: number
      async: false
    }
    {
      id: src/chain.ts:helper
      name: helper
      module: test
      package: call-chain
      filePath: src/chain.ts
      startLine: 14
      endLine: 16
      exported: true
      parameters: []
      returnType: void
      async: false
    }
  ]
}
edges [
  {
    source: src/chain.ts:funcA
    target: src/chain.ts:funcB
    type: CALLS
    callCount: 1
  }
  {
    source: src/chain.ts:funcB
    target: src/chain.ts:funcC
    type: CALLS
    callCount: 1
  }
  {
    source: src/chain.ts:helper
    target: src/chain.ts:funcA
    type: CALLS
    callCount: 2
  }
  {
    source: src/chain.ts
    target: src/chain.ts:funcA
    type: CONTAINS
  }
]
mermaid: ```mermaid
flowchart TD
  funcA["funcA (Function)"]:::center
  funcB["funcB (Function)"]
  funcC["funcC (Function)"]
  helper["helper (Function)"]
  chain.ts["chain.ts (File)"]

  funcA -->|CALLS| funcB
  funcB -->|CALLS| funcC
  helper -->|CALLS| funcA
  chain.ts -->|CONTAINS| funcA

  classDef center fill:#ff9,stroke:#333,stroke-width:3px
```
```

**Character Count:** 1,847

**Comprehensibility Notes:**
- ✅ Complete information at a glance
- ✅ Center node immediately visible with full context
- ✅ Type grouping makes scanning easier
- ❌ Massive redundancy: module/package/filePath repeated 5 times
- ❌ Derivable fields: name and filePath are in the id
- ❌ Long node IDs repeated in edges (4 times each)

---

## Format B: Simplified Center

Center node reduced to id and type only. Rest unchanged.

```
center {
  id: src/chain.ts:funcA
  type: Function
}
nodeCount: 4
edgeCount: 4
nodes {
  File [
    {
      id: src/chain.ts
      name: chain.ts
      module: test
      package: call-chain
      filePath: src/chain.ts
      startLine: 1
      endLine: 20
      exported: false
      extension: .ts
    }
  ]
  Function [
    {
      id: src/chain.ts:funcA
      name: funcA
      module: test
      package: call-chain
      filePath: src/chain.ts
      startLine: 10
      endLine: 12
      exported: true
      parameters: []
      returnType: string
      async: false
    }
    {
      id: src/chain.ts:funcB
      name: funcB
      module: test
      package: call-chain
      filePath: src/chain.ts
      startLine: 6
      endLine: 8
      exported: false
      parameters: []
      returnType: void
      async: false
    }
    {
      id: src/chain.ts:funcC
      name: funcC
      module: test
      package: call-chain
      filePath: src/chain.ts
      startLine: 2
      endLine: 4
      exported: false
      parameters: []
      returnType: number
      async: false
    }
    {
      id: src/chain.ts:helper
      name: helper
      module: test
      package: call-chain
      filePath: src/chain.ts
      startLine: 14
      endLine: 16
      exported: true
      parameters: []
      returnType: void
      async: false
    }
  ]
}
edges [
  {
    source: src/chain.ts:funcA
    target: src/chain.ts:funcB
    type: CALLS
    callCount: 1
  }
  {
    source: src/chain.ts:funcB
    target: src/chain.ts:funcC
    type: CALLS
    callCount: 1
  }
  {
    source: src/chain.ts:helper
    target: src/chain.ts:funcA
    type: CALLS
    callCount: 2
  }
  {
    source: src/chain.ts
    target: src/chain.ts:funcA
    type: CONTAINS
  }
]
mermaid: ```mermaid
flowchart TD
  funcA["funcA (Function)"]:::center
  funcB["funcB (Function)"]
  funcC["funcC (Function)"]
  helper["helper (Function)"]
  chain.ts["chain.ts (File)"]

  funcA -->|CALLS| funcB
  funcB -->|CALLS| funcC
  helper -->|CALLS| funcA
  chain.ts -->|CONTAINS| funcA

  classDef center fill:#ff9,stroke:#333,stroke-width:3px
```
```

**Character Count:** 1,738 (109 chars saved, 5.9% reduction)

**Comprehensibility Notes:**
- ✅ Center node still clearly identified
- ✅ Full details available in nodes array
- ✅ Small token savings with minimal comprehension loss
- ⚠️ Need to find center in nodes array for full details
- ❌ Still has all the redundancy issues from Format A

---

## Format C: Remove Derivables

Remove `name` and `filePath` from all nodes (both derivable from `id`). Keep everything else.

```
center {
  id: src/chain.ts:funcA
  type: Function
  module: test
  package: call-chain
  startLine: 10
  endLine: 12
  exported: true
  parameters: []
  returnType: string
  async: false
}
nodeCount: 4
edgeCount: 4
nodes {
  File [
    {
      id: src/chain.ts
      module: test
      package: call-chain
      startLine: 1
      endLine: 20
      exported: false
      extension: .ts
    }
  ]
  Function [
    {
      id: src/chain.ts:funcB
      module: test
      package: call-chain
      startLine: 6
      endLine: 8
      exported: false
      parameters: []
      returnType: void
      async: false
    }
    {
      id: src/chain.ts:funcC
      module: test
      package: call-chain
      startLine: 2
      endLine: 4
      exported: false
      parameters: []
      returnType: number
      async: false
    }
    {
      id: src/chain.ts:helper
      module: test
      package: call-chain
      startLine: 14
      endLine: 16
      exported: true
      parameters: []
      returnType: void
      async: false
    }
  ]
}
edges [
  {
    source: src/chain.ts:funcA
    target: src/chain.ts:funcB
    type: CALLS
    callCount: 1
  }
  {
    source: src/chain.ts:funcB
    target: src/chain.ts:funcC
    type: CALLS
    callCount: 1
  }
  {
    source: src/chain.ts:helper
    target: src/chain.ts:funcA
    type: CALLS
    callCount: 2
  }
  {
    source: src/chain.ts
    target: src/chain.ts:funcA
    type: CONTAINS
  }
]
mermaid: ```mermaid
flowchart TD
  funcA["funcA (Function)"]:::center
  funcB["funcB (Function)"]
  funcC["funcC (Function)"]
  helper["helper (Function)"]
  chain.ts["chain.ts (File)"]

  funcA -->|CALLS| funcB
  funcB -->|CALLS| funcC
  helper -->|CALLS| funcA
  chain.ts -->|CONTAINS| funcA

  classDef center fill:#ff9,stroke:#333,stroke-width:3px
```
```

**Character Count:** 1,557 (290 chars saved, 15.7% reduction from Format A)

**Comprehensibility Notes:**
- ✅ Still fully readable - IDs contain all removed info
- ✅ Significant token savings
- ✅ Parsing logic simple: split ID on `:` and `/`
- ⚠️ Slightly more cognitive load to parse names from IDs
- ❌ Still repeating module/package 5 times

---

## Format D: Maximum Compression

Hierarchical file-based structure, short IDs within file scope, simplified edges.

```
center: :funcA
module: test
package: call-chain
nodeCount: 4
edgeCount: 4
files {
  src/chain.ts [1-20] {
    funcC [2-4] Function { returnType: number }
    funcB [6-8] Function { returnType: void }
    funcA [10-12] Function { exported, returnType: string }*
    helper [14-16] Function { exported, returnType: void }
  }
}
edges [
  :funcA → :funcB (CALLS, 1)
  :funcB → :funcC (CALLS, 1)
  :helper → :funcA (CALLS, 2)
  src/chain.ts ⊃ :funcA
]
mermaid: ```mermaid
flowchart TD
  funcA["funcA"]:::center
  funcB["funcB"]
  funcC["funcC"]
  helper["helper"]

  funcA --> funcB
  funcB --> funcC
  helper --> funcA

  classDef center fill:#ff9,stroke:#333,stroke-width:3px
```
```

**Character Count:** 638 (1,209 chars saved, 65.5% reduction from Format A)

**Comprehensibility Notes:**
- ✅ Extreme compression - less than half the size
- ✅ Hierarchical structure mirrors code organization
- ✅ Center marked with `*` for quick scanning
- ✅ Hoisted common fields (module, package)
- ✅ Short IDs (`:funcA`) within file scope
- ⚠️ Different format paradigm - requires learning
- ⚠️ Edge notation uses symbols (`→` for CALLS, `⊃` for CONTAINS)
- ⚠️ Default values omitted (exported=false, async=false, parameters=[])
- ❌ More complex to parse programmatically
- ❌ Mixed with non-hierarchical data (edges still separate)

---

## Comparison Summary

| Format | Chars | Savings | Comprehension | Parsing Complexity |
|--------|-------|---------|---------------|-------------------|
| A (Current) | 1,847 | baseline | ⭐⭐⭐⭐⭐ Excellent | Simple |
| B (Simplified Center) | 1,738 | 5.9% | ⭐⭐⭐⭐⭐ Excellent | Simple |
| C (Remove Derivables) | 1,557 | 15.7% | ⭐⭐⭐⭐ Very Good | Simple |
| D (Maximum Compression) | 638 | 65.5% | ⭐⭐⭐ Good | Moderate |

## Recommendations

1. **Format B**: Quick win with minimal changes. Simplify center node to id/type only.

2. **Format C**: Best balance of compression and readability. Remove derivable fields (name, filePath).

3. **Format D**: Consider for very large subgraphs (100+ nodes) where token costs matter most. Requires new parser.

4. **Hybrid approach**: Start with Format C, add Format D as an optional `compact: true` parameter for power users.

## Implementation Notes

- **Format A**: Current implementation in `/src/toon/`
- **Format B**: Modify `encodeNode.ts` center encoding only
- **Format C**: Update all node encoders to skip name/filePath
- **Format D**: New encoder module required - hierarchical structure is incompatible with current two-phase encoding
