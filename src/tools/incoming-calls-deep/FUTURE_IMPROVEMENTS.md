# get-callers Tool Improvements

**Evaluation Grade: 7/10**

## Overview

The `get-callers` tool finds all functions/methods that call a given target function (reverse call graph traversal). It uses recursive CTEs to traverse incoming CALLS edges.

## Architecture

```
src/tools/get-callers/
├── handler.ts   # MCP tool definition and execute function
├── query.ts     # Recursive CTE traversing incoming CALLS edges
└── format.ts    # Hierarchical output formatting
```

## Test Scenarios

| Scenario | Status | Notes |
|----------|--------|-------|
| Direct callers (depth=1) | ✅ Pass | Returns immediate callers |
| Transitive callers (depth=N) | ✅ Pass | Follows reverse call chains |
| Non-existent node ID | ⚠️ Issue | Returns empty result silently |
| Invalid maxDepth values | ⚠️ Issue | No validation, silently handled |
| Node with no callers | ✅ Pass | Returns informative empty message |
| Entry point function | ✅ Pass | Returns empty (no callers) |

## Priority Improvements

### P1: Target Node Validation (High Impact)

**Problem**: Non-existent target nodes return empty results without distinguishing between "no callers exist" and "invalid node ID".

**Recommended implementation**:

```typescript
export function getCallers(
  db: Database.Database,
  nodeId: string,
  options?: QueryCallersOptions
): CallersResult {
  // Validate target node exists
  const node = db.prepare('SELECT id, type, name FROM nodes WHERE id = ?').get(nodeId);
  if (!node) {
    return {
      error: `Target node not found: ${nodeId}`,
      suggestion: 'Use LSP workspaceSymbol to find valid node IDs',
      didYouMean: findSimilarNodes(db, nodeId) // Optional: fuzzy matching
    };
  }

  // Validate node type
  if (!['Function', 'Method'].includes(node.type)) {
    return {
      error: `Node "${node.name}" is a ${node.type}. Only Function and Method nodes can have callers.`
    };
  }

  // Continue with query...
}
```

### P2: maxDepth Parameter Validation (Medium Impact)

**Problem**: `maxDepth` parameter is not validated. Out-of-range values should return clear errors.

**Recommended**:

```typescript
const MAX_DEPTH_LIMIT = 100;
const MIN_DEPTH = 1;

if (options?.maxDepth !== undefined) {
  if (!Number.isInteger(options.maxDepth)) {
    return { error: `maxDepth must be an integer (got: ${options.maxDepth})` };
  }
  if (options.maxDepth < MIN_DEPTH || options.maxDepth > MAX_DEPTH_LIMIT) {
    return { error: `maxDepth must be between ${MIN_DEPTH} and ${MAX_DEPTH_LIMIT}` };
  }
}
```

### P3: Depth Level in Output (Medium Impact)

**Problem**: Output doesn't show the depth at which each caller was found, making it hard to understand the call hierarchy distance.

**Current output**:
```
Callers of src/utils.ts:formatDate
├── Function: renderReport (src/reports.ts:45-78)
├── Function: displayTimestamp (src/ui.ts:12-25)
└── Method: User.getCreatedAt (src/models/User.ts:34-40)
```

**Enhanced output**:
```
Callers of src/utils.ts:formatDate (3 callers, max depth: 2)
├── [depth 1] Function: renderReport (src/reports.ts:45-78)
│   └── [depth 2] Function: generatePDF (src/export.ts:100-150)
├── [depth 1] Function: displayTimestamp (src/ui.ts:12-25)
└── [depth 1] Method: User.getCreatedAt (src/models/User.ts:34-40)
```

### P4: Module/Package Grouping (Low Impact)

**Problem**: When callers span multiple modules, the flat list makes it hard to see usage patterns.

**Enhanced output option**:
```
Callers of src/utils.ts:formatDate

Module: core
├── Function: renderReport (src/reports.ts:45-78)
└── Function: displayTimestamp (src/ui.ts:12-25)

Module: models
└── Method: User.getCreatedAt (src/models/User.ts:34-40)
```

## Testing Gaps

1. **No input validation tests** (non-existent nodes, invalid maxDepth)
2. **No cycle handling tests** (recursive functions)
3. **Missing edge cases**:
   - Functions called from multiple depths simultaneously
   - Very large caller sets (pagination?)
   - Cross-module caller resolution

## Implementation Roadmap

1. **Phase 1** (P1-P2): Comprehensive input validation with helpful errors
2. **Phase 2** (P3): Add depth indicators to output
3. **Phase 3** (P4): Optional module-grouped output format
