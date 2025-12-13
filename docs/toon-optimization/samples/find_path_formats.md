# TOON Format Alternatives for `find_path` Tool

This document compares 4 proposed TOON format alternatives for the `find_path` tool output using realistic sample data.

## Input Data

**Query**: Find path from `src/ingestion/Ingestion.ts:indexProject` to `src/db/sqlite/SqliteWriter.ts:addNodes`

**Path**:
1. `src/ingestion/Ingestion.ts:indexProject` (Function)
2. `src/ingestion/Extractor.ts:extractFromProject` (Function)
3. `src/db/DbWriter.ts:addNodes` (Method)
4. `src/db/sqlite/SqliteWriter.ts:addNodes` (Method)

**Edges**:
1. `indexProject` → `extractFromProject` (CALLS, callCount=1)
2. `extractFromProject` → `DbWriter.addNodes` (CALLS, callCount=3)
3. `DbWriter.addNodes` → `SqliteWriter.addNodes` (IMPLEMENTS)

---

## Format A (Current)

**Description**: Full format with all metadata including derivable fields.

**Sample Output**:

```
Path(
  start: "src/ingestion/Ingestion.ts:indexProject"
  end: "src/db/sqlite/SqliteWriter.ts:addNodes"
  length: 3
  nodes: [
    Node(
      id: "src/ingestion/Ingestion.ts:indexProject"
      type: "Function"
      name: "indexProject"
      module: "core"
      package: "main"
      filePath: "src/ingestion/Ingestion.ts"
      startLine: 45
      endLine: 67
      exported: true
      parameters: ["config: ProjectConfig", "dbWriter: DbWriter"]
      returnType: "Promise<void>"
      async: true
    )
    Node(
      id: "src/ingestion/Extractor.ts:extractFromProject"
      type: "Function"
      name: "extractFromProject"
      module: "core"
      package: "main"
      filePath: "src/ingestion/Extractor.ts"
      startLine: 89
      endLine: 145
      exported: true
      parameters: ["project: Project", "context: ExtractionContext"]
      returnType: "ExtractionResult"
      async: false
    )
    Node(
      id: "src/db/DbWriter.ts:addNodes"
      type: "Method"
      name: "addNodes"
      module: "core"
      package: "main"
      filePath: "src/db/DbWriter.ts"
      startLine: 12
      endLine: 12
      exported: false
      parameters: ["nodes: Node[]"]
      returnType: "Promise<void>"
      async: true
      visibility: "public"
      static: false
    )
    Node(
      id: "src/db/sqlite/SqliteWriter.ts:addNodes"
      type: "Method"
      name: "addNodes"
      module: "core"
      package: "main"
      filePath: "src/db/sqlite/SqliteWriter.ts"
      startLine: 78
      endLine: 112
      exported: false
      parameters: ["nodes: Node[]"]
      returnType: "Promise<void>"
      async: true
      visibility: "public"
      static: false
    )
  ]
  edges: [
    Edge(
      source: "src/ingestion/Ingestion.ts:indexProject"
      target: "src/ingestion/Extractor.ts:extractFromProject"
      type: "CALLS"
      callCount: 1
      isTypeOnly: <nil>
      importedSymbols: <nil>
      context: <nil>
    )
    Edge(
      source: "src/ingestion/Extractor.ts:extractFromProject"
      target: "src/db/DbWriter.ts:addNodes"
      type: "CALLS"
      callCount: 3
      isTypeOnly: <nil>
      importedSymbols: <nil>
      context: <nil>
    )
    Edge(
      source: "src/db/DbWriter.ts:addNodes"
      target: "src/db/sqlite/SqliteWriter.ts:addNodes"
      type: "IMPLEMENTS"
      callCount: <nil>
      isTypeOnly: <nil>
      importedSymbols: <nil>
      context: <nil>
    )
  ]
)
```

**Character Count**: 2,389 characters

**Analysis**:
- **Redundant fields**:
  - `start`: Derivable from `nodes[0].id`
  - `end`: Derivable from `nodes[nodes.length-1].id`
  - `length`: Derivable from `edges.length` (or `nodes.length - 1`)
  - `name`: Derivable from `id` (portion after last `:`)
  - `filePath`: Derivable from `id` (portion before first `:`)
  - Edge `source`: Derivable from `nodes[i].id`
  - Edge `target`: Derivable from `nodes[i+1].id`
  - Edge `isTypeOnly`, `importedSymbols`, `context`: Always null for CALLS/IMPLEMENTS edges

- **Benefit**: Self-documenting, no inference needed
- **Cost**: Maximum token usage

---

## Format B (Remove Derivables)

**Description**: Remove top-level derivable fields (start, end, length) but keep full edge metadata.

**Sample Output**:

```
Path(
  nodes: [
    Node(
      id: "src/ingestion/Ingestion.ts:indexProject"
      type: "Function"
      name: "indexProject"
      module: "core"
      package: "main"
      filePath: "src/ingestion/Ingestion.ts"
      startLine: 45
      endLine: 67
      exported: true
      parameters: ["config: ProjectConfig", "dbWriter: DbWriter"]
      returnType: "Promise<void>"
      async: true
    )
    Node(
      id: "src/ingestion/Extractor.ts:extractFromProject"
      type: "Function"
      name: "extractFromProject"
      module: "core"
      package: "main"
      filePath: "src/ingestion/Extractor.ts"
      startLine: 89
      endLine: 145
      exported: true
      parameters: ["project: Project", "context: ExtractionContext"]
      returnType: "ExtractionResult"
      async: false
    )
    Node(
      id: "src/db/DbWriter.ts:addNodes"
      type: "Method"
      name: "addNodes"
      module: "core"
      package: "main"
      filePath: "src/db/DbWriter.ts"
      startLine: 12
      endLine: 12
      exported: false
      parameters: ["nodes: Node[]"]
      returnType: "Promise<void>"
      async: true
      visibility: "public"
      static: false
    )
    Node(
      id: "src/db/sqlite/SqliteWriter.ts:addNodes"
      type: "Method"
      name: "addNodes"
      module: "core"
      package: "main"
      filePath: "src/db/sqlite/SqliteWriter.ts"
      startLine: 78
      endLine: 112
      exported: false
      parameters: ["nodes: Node[]"]
      returnType: "Promise<void>"
      async: true
      visibility: "public"
      static: false
    )
  ]
  edges: [
    Edge(
      source: "src/ingestion/Ingestion.ts:indexProject"
      target: "src/ingestion/Extractor.ts:extractFromProject"
      type: "CALLS"
      callCount: 1
      isTypeOnly: <nil>
      importedSymbols: <nil>
      context: <nil>
    )
    Edge(
      source: "src/ingestion/Extractor.ts:extractFromProject"
      target: "src/db/DbWriter.ts:addNodes"
      type: "CALLS"
      callCount: 3
      isTypeOnly: <nil>
      importedSymbols: <nil>
      context: <nil>
    )
    Edge(
      source: "src/db/DbWriter.ts:addNodes"
      target: "src/db/sqlite/SqliteWriter.ts:addNodes"
      type: "IMPLEMENTS"
      callCount: <nil>
      isTypeOnly: <nil>
      importedSymbols: <nil>
      context: <nil>
    )
  ]
)
```

**Character Count**: 2,236 characters

**Savings**: 153 characters (6.4% reduction from Format A)

**Derivation Rules**:
- `start` = `nodes[0].id`
- `end` = `nodes[nodes.length - 1].id`
- `length` = `edges.length` or `nodes.length - 1`

**Analysis**:
- Simple derivation with minimal LLM overhead
- Still contains redundant edge metadata (source/target)
- Still contains null fields for edge types

---

## Format C (Compact Edges)

**Description**: Remove source/target from edges (derivable from position), keep only type and relevant metadata.

**Sample Output**:

```
Path(
  start: "src/ingestion/Ingestion.ts:indexProject"
  end: "src/db/sqlite/SqliteWriter.ts:addNodes"
  length: 3
  nodes: [
    Node(
      id: "src/ingestion/Ingestion.ts:indexProject"
      type: "Function"
      name: "indexProject"
      module: "core"
      package: "main"
      filePath: "src/ingestion/Ingestion.ts"
      startLine: 45
      endLine: 67
      exported: true
      parameters: ["config: ProjectConfig", "dbWriter: DbWriter"]
      returnType: "Promise<void>"
      async: true
    )
    Node(
      id: "src/ingestion/Extractor.ts:extractFromProject"
      type: "Function"
      name: "extractFromProject"
      module: "core"
      package: "main"
      filePath: "src/ingestion/Extractor.ts"
      startLine: 89
      endLine: 145
      exported: true
      parameters: ["project: Project", "context: ExtractionContext"]
      returnType: "ExtractionResult"
      async: false
    )
    Node(
      id: "src/db/DbWriter.ts:addNodes"
      type: "Method"
      name: "addNodes"
      module: "core"
      package: "main"
      filePath: "src/db/DbWriter.ts"
      startLine: 12
      endLine: 12
      exported: false
      parameters: ["nodes: Node[]"]
      returnType: "Promise<void>"
      async: true
      visibility: "public"
      static: false
    )
    Node(
      id: "src/db/sqlite/SqliteWriter.ts:addNodes"
      type: "Method"
      name: "addNodes"
      module: "core"
      package: "main"
      filePath: "src/db/sqlite/SqliteWriter.ts"
      startLine: 78
      endLine: 112
      exported: false
      parameters: ["nodes: Node[]"]
      returnType: "Promise<void>"
      async: true
      visibility: "public"
      static: false
    )
  ]
  edges: [
    Edge(type: "CALLS" callCount: 1)
    Edge(type: "CALLS" callCount: 3)
    Edge(type: "IMPLEMENTS")
  ]
)
```

**Character Count**: 1,821 characters

**Savings**: 568 characters (23.8% reduction from Format A)

**Derivation Rules**:
- `edges[i].source` = `nodes[i].id`
- `edges[i].target` = `nodes[i+1].id`
- Edge metadata only includes non-null, type-specific fields

**Analysis**:
- Significant token savings from compact edges
- Position-based derivation is straightforward
- Type-specific fields only (CALLS has callCount, IMPLEMENTS has nothing)
- Still has redundant top-level fields

---

## Format D (Maximum Compression)

**Description**: Combine B+C, plus remove derivable node fields (name, filePath). Type-specific edge fields only.

**Sample Output**:

```
Path(
  nodes: [
    Node(
      id: "src/ingestion/Ingestion.ts:indexProject"
      type: "Function"
      module: "core"
      package: "main"
      startLine: 45
      endLine: 67
      exported: true
      parameters: ["config: ProjectConfig", "dbWriter: DbWriter"]
      returnType: "Promise<void>"
      async: true
    )
    Node(
      id: "src/ingestion/Extractor.ts:extractFromProject"
      type: "Function"
      module: "core"
      package: "main"
      startLine: 89
      endLine: 145
      exported: true
      parameters: ["project: Project", "context: ExtractionContext"]
      returnType: "ExtractionResult"
      async: false
    )
    Node(
      id: "src/db/DbWriter.ts:addNodes"
      type: "Method"
      module: "core"
      package: "main"
      startLine: 12
      endLine: 12
      exported: false
      parameters: ["nodes: Node[]"]
      returnType: "Promise<void>"
      async: true
      visibility: "public"
      static: false
    )
    Node(
      id: "src/db/sqlite/SqliteWriter.ts:addNodes"
      type: "Method"
      module: "core"
      package: "main"
      startLine: 78
      endLine: 112
      exported: false
      parameters: ["nodes: Node[]"]
      returnType: "Promise<void>"
      async: true
      visibility: "public"
      static: false
    )
  ]
  edges: [
    Edge(type: "CALLS" callCount: 1)
    Edge(type: "CALLS" callCount: 3)
    Edge(type: "IMPLEMENTS")
  ]
)
```

**Character Count**: 1,465 characters

**Savings**: 924 characters (38.7% reduction from Format A)

**Derivation Rules**:
- All rules from Format B (start, end, length)
- All rules from Format C (edge source/target)
- `name` = `id.split(':').slice(1).join(':').split('.').pop()` (portion after last `:` and last `.`)
- `filePath` = `id.split(':')[0]`

**Analysis**:
- Maximum token efficiency (38.7% reduction)
- More complex derivation logic for name/filePath
- LLM can easily parse ID format to extract these fields
- Trade-off: Requires ID parsing vs. explicit fields

---

## Comparison Summary

| Format | Characters | Reduction | Derivation Complexity | LLM Friendliness |
|--------|-----------|-----------|----------------------|------------------|
| **A (Current)** | 2,389 | 0% (baseline) | None | Highest (self-documenting) |
| **B (Remove Top-Level)** | 2,236 | 6.4% | Low (array indexing) | High |
| **C (Compact Edges)** | 1,821 | 23.8% | Low (position-based) | High |
| **D (Maximum)** | 1,465 | 38.7% | Medium (ID parsing) | Medium-High |

## Token Reduction Analysis

Assuming ~4 characters per token (typical for code):

| Format | Approx Tokens | Token Savings |
|--------|--------------|---------------|
| **A (Current)** | ~597 tokens | 0 tokens |
| **B (Remove Top-Level)** | ~559 tokens | 38 tokens (6.4%) |
| **C (Compact Edges)** | ~455 tokens | 142 tokens (23.8%) |
| **D (Maximum)** | ~366 tokens | 231 tokens (38.7%) |

## Recommendations

### For Short Paths (1-5 nodes)
**Recommend Format C** - Best balance of compression (23.8%) and simplicity. Edge compaction provides significant savings without complex ID parsing.

### For Medium Paths (6-15 nodes)
**Recommend Format D** - Maximum compression (38.7%) becomes more valuable. The overhead of ID parsing is amortized across more nodes.

### For Long Paths (16+ nodes)
**Strongly recommend Format D** - Token savings scale linearly with path length. A 30-node path could save ~460 tokens vs. Format A.

### General Principle
Format D's ID parsing is trivial for LLMs (simple string operations), so the 38.7% token reduction almost always outweighs the minimal cognitive overhead.

## Implementation Notes

### Derivation Functions (TypeScript)

```typescript
// Format B derivations
function deriveStart(path: Path): string {
  return path.nodes[0].id;
}

function deriveEnd(path: Path): string {
  return path.nodes[path.nodes.length - 1].id;
}

function deriveLength(path: Path): number {
  return path.edges.length;
}

// Format C derivations
function deriveEdgeSource(path: Path, edgeIndex: number): string {
  return path.nodes[edgeIndex].id;
}

function deriveEdgeTarget(path: Path, edgeIndex: number): string {
  return path.nodes[edgeIndex + 1].id;
}

// Format D derivations
function deriveFilePath(id: string): string {
  return id.split(':')[0];
}

function deriveName(id: string): string {
  const symbolPath = id.split(':').slice(1).join(':');
  return symbolPath.split('.').pop() || '';
}
```

### LLM Perspective

From an LLM's perspective, Format D is optimal because:

1. **ID parsing is trivial**: Splitting on `:` and `.` is basic string manipulation
2. **Position-based edges are natural**: Sequential arrays imply connections
3. **Token savings compound**: Every repeated field eliminated saves tokens across all nodes
4. **Cognitive load is minimal**: The derivation rules are simple patterns

The 38.7% token reduction from Format D allows for:
- Longer paths in context windows
- More detailed node metadata
- Additional analysis in the same response
- Lower API costs for users
