# get-callees Tool Improvements

**Evaluation Grade: 7/10**

## Overview

The `get-callees` tool finds all functions/methods that a given source function calls (forward call graph traversal). It uses recursive CTEs to traverse outgoing CALLS edges.

## Architecture

```
src/tools/get-callees/
├── handler.ts   # MCP tool definition and execute function
├── query.ts     # Recursive CTE traversing outgoing CALLS edges
└── format.ts    # Hierarchical output formatting
```

## Test Scenarios

| Scenario | Status | Notes |
|----------|--------|-------|
| Direct callees (depth=1) | ✅ Pass | Returns immediate function calls |
| Transitive callees (depth=N) | ✅ Pass | Follows call chains correctly |
| Non-existent node ID | ⚠️ Issue | Returns empty result silently |
| Invalid maxDepth (0, -1, 101) | ⚠️ Issue | Silently clamped or ignored |
| Node with no callees | ✅ Pass | Returns empty result with message |
| Method calls within class | ✅ Pass | Correctly resolves method references |

## Priority Improvements

### P1: Input Validation (High Impact)

**Problem**: No validation of `nodeId` parameter. Non-existent nodes return empty results without explanation.

**Recommended implementation**:

```typescript
export function getCallees(
  db: Database.Database,
  nodeId: string,
  options?: QueryCalleesOptions
): CalleesResult {
  // Validate node exists
  const node = db.prepare('SELECT type FROM nodes WHERE id = ?').get(nodeId);
  if (!node) {
    return {
      error: `Node not found: ${nodeId}`,
      suggestion: 'Use search_nodes tool to find valid node IDs'
    };
  }

  // Validate node type is callable
  if (!['Function', 'Method'].includes(node.type)) {
    return {
      error: `Node ${nodeId} is a ${node.type}, not a callable`,
      suggestion: 'Only Function and Method nodes have callees'
    };
  }

  // Continue with query...
}
```

### P2: maxDepth Validation (Medium Impact)

**Problem**: The `maxDepth` parameter accepts any value without validation. Values outside 1-100 range should return clear errors.

**Current behavior**: Invalid values are silently handled (clamped or cause unexpected behavior).

**Recommended**:

```typescript
if (options?.maxDepth !== undefined) {
  if (options.maxDepth < 1 || options.maxDepth > 100) {
    return {
      error: `maxDepth must be between 1 and 100 (got: ${options.maxDepth})`
    };
  }
}
```

### P3: Depth Level Information (Medium Impact)

**Problem**: Output doesn't indicate at what depth each callee was found. This makes it hard to understand the call hierarchy.

**Current output**:
```
Callees of src/api.ts:handleRequest
├── Function: validateInput (src/validation.ts:12-25)
├── Function: processData (src/processor.ts:8-45)
└── Function: formatResponse (src/formatter.ts:15-30)
```

**Enhanced output**:
```
Callees of src/api.ts:handleRequest
├── [depth 1] Function: validateInput (src/validation.ts:12-25)
├── [depth 1] Function: processData (src/processor.ts:8-45)
│   └── [depth 2] Function: transformData (src/transform.ts:5-20)
└── [depth 1] Function: formatResponse (src/formatter.ts:15-30)
```

### P4: Call Count Display (Low Impact)

**Problem**: CALLS edges store `callCount` metadata but it's not shown in output.

**Recommendation**: Show call frequency to highlight hot paths:
```
├── Function: validateInput (called 3x)
```

## Testing Gaps

1. **No validation tests** for invalid inputs
2. **No cycle detection tests** (A calls B calls A)
3. **Missing tests for**:
   - Very deep call chains (maxDepth stress test)
   - Empty results formatting
   - Mixed Function/Method callees

## Implementation Roadmap

1. **Phase 1** (P1-P2): Add comprehensive input validation
2. **Phase 2** (P3): Enhance output with depth indicators
3. **Phase 3** (P4): Add call count to output format
