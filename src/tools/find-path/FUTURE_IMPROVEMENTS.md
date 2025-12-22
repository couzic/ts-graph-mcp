# findPath Tool Improvements

**Evaluation Grade: 8/10**

## Overview

The `findPath` tool finds the shortest path between two nodes in the code graph using BFS (Breadth-First Search) implemented via SQLite recursive CTEs.

## Architecture

```
src/tools/find-path/
├── handler.ts   # MCP tool definition and execute function
├── query.ts     # BFS traversal using recursive CTE
└── format.ts    # Path formatting for LLM output
```

## Test Scenarios

| Scenario | Status | Notes |
|----------|--------|-------|
| Direct caller → callee path | ✅ Pass | Returns shortest path correctly |
| Multi-hop traversal | ✅ Pass | Finds paths through intermediate nodes |
| Non-existent source node | ✅ Pass | Handled by symbol resolution |
| Non-existent target node | ✅ Pass | Handled by symbol resolution |
| No path exists | ✅ Pass | Returns "No path found" message |
| Same source and target | ✅ Pass | Returns single-node path |

## Priority Improvements

### P1: Path Metadata Enhancement (Medium Impact)

**Problem**: The path output shows nodes but not the edge types connecting them.

**Current output**:
```
Path: A → B → C
```

**Enhanced output**:
```
Path: A --[CALLS]--> B --[USES_TYPE]--> C
```

This helps users understand *how* nodes are connected without exposing edge types as an input parameter.

### P2: Multiple Paths Support (Low Impact)

**Problem**: Currently returns only the shortest path. Sometimes users want to see alternative paths.

**Recommended**: Add optional `maxPaths` parameter to return top N shortest paths.

## Design Decisions

### Why No Edge Type Filtering?

Path finding traverses **all edge types** because:

1. **Discovery over filtering**: Path finding is exploratory - users want to discover *how* two symbols are connected, not pre-filter based on assumptions.

2. **No implementation leakage**: Exposing `edgeTypes: ["CALLS", "USES_TYPE"]` in the MCP API would leak internal graph concepts.

3. **Output shows edge types**: The enhanced P1 improvement shows edge types in the *output*, which is informative without requiring users to understand edge semantics upfront.

4. **Focused tools exist**: For call-chain-only paths, users can trace through `incomingCallsDeep` / `outgoingCallsDeep` results.

## Testing Gaps

1. **No edge case tests** for:
   - Circular dependencies (A → B → A)
   - Very long paths (stress testing max depth)

## Implementation Roadmap

1. **Phase 1** (P1): Enhance path output with edge labels
2. **Phase 2** (P2): Add optional `maxPaths` parameter
