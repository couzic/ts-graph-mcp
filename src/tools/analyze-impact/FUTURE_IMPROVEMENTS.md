# analyzeImpact Tool - Implementation Notes

**Status: Implemented ✅**

## Overview

The `analyzeImpact` tool performs impact analysis - finding all code that would be affected by changes to a target node. It traverses all edge types (CALLS, IMPORTS, USES_TYPE, EXTENDS, IMPLEMENTS) in the incoming direction to show the complete blast radius.

## Architecture

```
src/tools/analyze-impact/
├── handler.ts   # MCP tool definition and execute function
├── query.ts     # Multi-edge recursive CTE with depth and edge type tracking
└── format.ts    # Hierarchical impact report formatting
```

## Implemented Features

### 1. Depth Tracking ✅

Each impacted node includes its minimum depth from the target:
- **depth 1**: Direct dependents (highest confidence impact)
- **depth 2+**: Transitive dependents (propagated impact)

The SQL query uses a recursive CTE that tracks depth and selects minimum depth per node.

### 2. Edge Type Tracking ✅

Each node includes the edge type that first connected it to the impact chain:
- `CALLS` → shown as "callers"
- `USES_TYPE` → shown as "type_users"
- `IMPORTS` → shown as "importers"
- `EXTENDS` → shown as "extenders"
- `IMPLEMENTS` → shown as "implementers"

### 3. Summary Statistics ✅

The output includes a comprehensive summary header:
- Total nodes and files impacted
- Direct vs transitive counts
- Maximum depth reached
- Breakdown by relationship type (with direct counts)
- Breakdown by module (when multiple modules affected)

## Output Format

```
target:
  name: formatDate
  type: Function
  file: src/utils.ts
  offset: 15
  limit: 6
  module: core
  package: main

summary:
  total: 42 impacted across 12 files
  direct: 5
  transitive: 37
  max_depth: 5

  by_relationship:
    callers: 28 (3 direct)
    type_users: 8 (1 direct)
    importers: 6 (1 direct)

  by_module:
    core: 18
    api: 15
    shared: 9

callers[28]:
  direct[3]:
    src/reports.ts (1):
      functions[1]:
        renderReport [10-25] exp (data:Report) → string
          offset: 10, limit: 16
  transitive[25]:
    src/api/handler.ts (2):
      functions[2]:
        handleRequest [10-25] exp async
          offset: 10, limit: 16

type_users[8]:
  direct[1]:
    ...
```

## Design Decisions

### Why No Edge Type Filtering?

Impact analysis intentionally traverses **all edge types** because:

1. **Complete blast radius**: When changing a symbol, you want to know everything that depends on it, regardless of how (calls, type usage, inheritance, imports)

2. **No implementation leakage**: Exposing `edgeTypes: ["CALLS", "USES_TYPE"]` in the MCP API would leak internal graph concepts. AI agents shouldn't need to understand edge type semantics.

3. **Separate tools exist**: For focused analysis, use `incomingCallsDeep` (CALLS only) or `incomingPackageDeps` (IMPORTS only).

### Why No Module Filtering?

1. **Cross-module impact is the most important signal**: If changing `User` breaks code in `api`, `auth`, AND `billing`, that's critical information.

2. **Filtering hides risk**: Module filtering would hide the most impactful changes (those affecting multiple modules).

3. **Post-process if needed**: Consumers can filter results themselves if they need module-specific views.

## Potential Future Enhancements

1. **High-risk file detection**: Identify files with the most impacted nodes (currently just counted in by_module)
2. **Call chain visualization**: Show the path from target to distant nodes
3. **Breaking change detection**: Distinguish between signature changes vs implementation changes
