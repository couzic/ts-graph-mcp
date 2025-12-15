# get-neighbors Tool Improvements

**Evaluation Grade: 7/10 (UX Score)**

## Overview

The `get-neighbors` tool extracts a subgraph containing all nodes within a specified distance from a center node. It supports directional traversal (incoming, outgoing, or both) and produces Mermaid diagrams for visualization.

## Architecture

```
src/tools/get-neighbors/
├── handler.ts   # MCP tool definition and execute function
├── query.ts     # Distance-based subgraph extraction
└── format.ts    # Subgraph + Mermaid diagram formatting
```

## Test Scenarios

| Scenario | Status | Notes |
|----------|--------|-------|
| Distance=1 neighbors | ✅ Pass | Returns immediate connections |
| Distance=N expansion | ✅ Pass | Expands correctly |
| Direction: outgoing | ✅ Pass | Only follows outgoing edges |
| Direction: incoming | ✅ Pass | Only follows incoming edges |
| Direction: both | ✅ Pass | Follows all edges |
| Non-existent center node | ⚠️ Issue | Empty result, no error |
| Large neighborhood | ⚠️ Issue | No pagination, may overwhelm |
| Distance out of range | ⚠️ Issue | Silently clamped |

## Priority Improvements

### P1: Center Node Validation (High Impact)

**Problem**: Non-existent center nodes return empty subgraphs without error messages.

**Recommended implementation**:

```typescript
export function getNeighbors(
  db: Database.Database,
  nodeId: string,
  options?: NeighborOptions
): NeighborhoodResult {
  // Validate center node exists
  const centerNode = db.prepare('SELECT id, type, name FROM nodes WHERE id = ?').get(nodeId);
  if (!centerNode) {
    return {
      error: `Center node not found: ${nodeId}`,
      suggestion: 'Use search_nodes tool to find valid node IDs'
    };
  }

  // Continue with subgraph extraction...
}
```

### P2: Parameter Validation (High Impact)

**Problem**: Invalid `distance` values are silently clamped to 1-100 range. Users should be informed of constraints.

**Current behavior**:
```
Input: distance=-5  → Silently becomes 1
Input: distance=500 → Silently becomes 100
```

**Recommended**:

```typescript
if (options?.distance !== undefined) {
  if (!Number.isInteger(options.distance) || options.distance < 1 || options.distance > 100) {
    return {
      error: `distance must be an integer between 1 and 100 (got: ${options.distance})`
    };
  }
}

if (options?.direction && !['incoming', 'outgoing', 'both'].includes(options.direction)) {
  return {
    error: `direction must be 'incoming', 'outgoing', or 'both' (got: ${options.direction})`
  };
}
```

### P3: Edge Type Filtering (Medium Impact)

**Problem**: Cannot filter which edge types to traverse when exploring neighbors.

**Use cases**:
- "Show me all the CALLS relationships around this function" (exclude USES_TYPE, IMPORTS)
- "Show me the inheritance hierarchy" (only EXTENDS, IMPLEMENTS)

**Recommended addition**:

```typescript
{
  name: 'get_neighbors',
  inputSchema: {
    // ... existing params
    edgeTypes: {
      type: 'array',
      items: {
        type: 'string',
        enum: ['CALLS', 'IMPORTS', 'USES_TYPE', 'EXTENDS', 'IMPLEMENTS', 'CONTAINS']
      },
      description: 'Edge types to traverse (default: all)'
    }
  }
}
```

### P4: Result Size Limits / Pagination (Medium Impact)

**Problem**: Large neighborhoods can return hundreds of nodes, overwhelming the output and consuming excessive tokens.

**Recommended approach**:

```typescript
{
  maxNodes: {
    type: 'number',
    description: 'Maximum nodes to return (default: 50)',
    default: 50
  }
}
```

**Output when truncated**:
```
Neighborhood of src/utils.ts:formatDate (showing 50 of 127 nodes)
⚠️ Result truncated. Use smaller distance or add edge type filters.

[Mermaid diagram with 50 nodes]
```

### P5: Mermaid Diagram Improvements (Low Impact)

**Current Mermaid output** is functional but could be enhanced:

**Improvements**:
1. **Color coding by node type**: Functions green, Classes blue, Interfaces purple
2. **Edge labels**: Show edge type on arrows
3. **Highlight center node**: Make the starting node visually distinct

**Enhanced Mermaid**:
```mermaid
graph TD
    classDef function fill:#90EE90
    classDef class fill:#87CEEB
    classDef interface fill:#DDA0DD
    classDef center fill:#FFD700,stroke:#FF4500,stroke-width:3px

    A[formatDate]:::center
    B[renderReport]:::function
    C[User]:::class

    B -->|CALLS| A
    C -->|USES_TYPE| A
```

### P6: Subgraph Statistics (Low Impact)

**Problem**: No summary of the extracted subgraph.

**Recommended header**:
```
Neighborhood of src/utils.ts:formatDate
─────────────────────────────────────────
Distance: 2 | Direction: both
Nodes: 15 (5 Functions, 4 Methods, 3 Classes, 3 Interfaces)
Edges: 23 (12 CALLS, 8 USES_TYPE, 3 EXTENDS)
```

## Testing Gaps

1. **No input validation tests** (non-existent nodes, out-of-range distance)
2. **No tests for**:
   - Very large neighborhoods (performance/pagination)
   - Edge cases with direction parameter
   - Mermaid diagram correctness
3. **Missing integration tests** for combined parameters

## Implementation Roadmap

1. **Phase 1** (P1-P2): Comprehensive input validation
2. **Phase 2** (P3-P4): Edge type filtering and result size limits
3. **Phase 3** (P5-P6): Mermaid enhancements and statistics
