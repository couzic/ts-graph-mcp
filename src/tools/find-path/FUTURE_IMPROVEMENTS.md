# find-path Tool Improvements

**Evaluation Grade: 8/10**

## Overview

The `find-path` tool finds the shortest path between two nodes in the code graph using BFS (Breadth-First Search) implemented via SQLite recursive CTEs.

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
| Non-existent source node | ⚠️ Issue | Returns empty result, no error message |
| Non-existent target node | ⚠️ Issue | Returns empty result, no error message |
| No path exists | ✅ Pass | Returns "No path found" message |
| Same source and target | ✅ Pass | Returns single-node path |

## Priority Improvements

### P1: Node Existence Validation (High Impact)

**Problem**: When a non-existent node ID is provided, the tool returns an empty result without explaining why. Users cannot distinguish between "no path exists" and "invalid node ID".

**Current behavior**:
```
Input: sourceId="nonexistent:foo", targetId="src/utils.ts:format"
Output: "No path found between nonexistent:foo and src/utils.ts:format"
```

**Recommended implementation** in `query.ts`:

```typescript
export function findPath(db: Database.Database, sourceId: string, targetId: string): Path | null {
  // Validate source node exists
  const sourceExists = db.prepare('SELECT 1 FROM nodes WHERE id = ?').get(sourceId);
  if (!sourceExists) {
    return {
      error: `Source node not found: ${sourceId}`,
      suggestion: 'Use LSP workspaceSymbol to find valid node IDs'
    };
  }

  // Validate target node exists
  const targetExists = db.prepare('SELECT 1 FROM nodes WHERE id = ?').get(targetId);
  if (!targetExists) {
    return {
      error: `Target node not found: ${targetId}`,
      suggestion: 'Use LSP workspaceSymbol to find valid node IDs'
    };
  }

  // Continue with BFS traversal...
}
```

### P2: Edge Type Filtering (Medium Impact)

**Problem**: The tool traverses all edge types, which may return paths through unrelated relationships (e.g., finding a path via CONTAINS edges when user wants CALLS-only paths).

**Recommended addition** to MCP interface:

```typescript
// In handler.ts
{
  name: 'find_path',
  inputSchema: {
    // ... existing params
    edgeTypes: {
      type: 'array',
      items: { type: 'string', enum: ['CALLS', 'IMPORTS', 'USES_TYPE', 'EXTENDS', 'IMPLEMENTS'] },
      description: 'Edge types to traverse (default: all)'
    }
  }
}
```

### P3: Max Depth Configuration (Low Impact)

**Problem**: The recursive CTE has a hardcoded max depth of 20. For large codebases, users may want to limit this further for performance, or extend it for deep hierarchies.

**Current code** (`query.ts`):
```sql
WHERE depth < 20  -- Hardcoded limit
```

**Recommended**: Expose as optional parameter with sensible default.

### P4: Path Metadata Enhancement (Low Impact)

**Problem**: The path output shows nodes but not the edge types connecting them.

**Current output**:
```
Path: A → B → C
```

**Enhanced output**:
```
Path: A --[CALLS]--> B --[USES_TYPE]--> C
```

## Testing Gaps

1. **No unit tests** for `query.ts` - BFS logic is untested in isolation
2. **No edge case tests** for:
   - Circular dependencies (A → B → A)
   - Self-referencing nodes
   - Very long paths (stress testing max depth)
3. **No integration tests** validating error message format

## Implementation Roadmap

1. **Phase 1** (P1): Add node validation with helpful error messages
2. **Phase 2** (P2): Add optional `edgeTypes` filter parameter
3. **Phase 3** (P3-P4): Expose max depth parameter and enhance path output with edge labels
