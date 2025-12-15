# get-impact Tool Improvements

**Evaluation Grade: 8.5/10**

## Overview

The `get-impact` tool performs impact analysis - finding all code that would be affected by changes to a target node. It traverses multiple edge types (CALLS, IMPORTS, USES_TYPE, EXTENDS, IMPLEMENTS) in the incoming direction.

## Architecture

```
src/tools/get-impact/
├── handler.ts   # MCP tool definition and execute function
├── query.ts     # Multi-edge recursive CTE traversal
└── format.ts    # Impact report formatting
```

## Test Scenarios

| Scenario | Status | Notes |
|----------|--------|-------|
| Function with callers | ✅ Pass | Shows all transitive callers |
| Interface with implementers | ✅ Pass | Shows implementing classes |
| Type with usages | ✅ Pass | Shows parameter/return type usages |
| Non-existent node | ⚠️ Issue | Empty result, no error message |
| Node with no dependents | ✅ Pass | Clear "no impact" message |
| Utility function (high impact) | ✅ Pass | Correctly shows widespread usage |

## Priority Improvements

### P1: Input Validation (High Impact)

**Problem**: No validation of `nodeId` parameter. Invalid nodes return empty results without explanation.

**Recommended implementation**:

```typescript
export function getImpact(
  db: Database.Database,
  nodeId: string,
  options?: ImpactOptions
): ImpactResult {
  // Validate node exists
  const node = db.prepare('SELECT id, type, name, file_path FROM nodes WHERE id = ?').get(nodeId);
  if (!node) {
    return {
      error: `Node not found: ${nodeId}`,
      suggestion: 'Use search_nodes tool to find valid node IDs'
    };
  }

  // Continue with impact analysis...
}
```

### P2: Expose Edge Type Filtering (Medium Impact)

**Problem**: The `query.ts` has internal support for `edgeTypes` filtering, but this parameter is NOT exposed in the MCP tool interface. Users cannot limit impact analysis to specific relationship types.

**Current state**:
- `query.ts` accepts `edgeTypes?: EdgeType[]` option
- `handler.ts` doesn't expose this parameter

**Recommended addition to MCP interface**:

```typescript
// In handler.ts
{
  name: 'get_impact',
  inputSchema: {
    nodeId: { type: 'string' },
    maxDepth: { type: 'number' },
    edgeTypes: {
      type: 'array',
      items: {
        type: 'string',
        enum: ['CALLS', 'IMPORTS', 'USES_TYPE', 'EXTENDS', 'IMPLEMENTS']
      },
      description: 'Limit impact analysis to specific relationship types'
    }
  }
}
```

**Use cases**:
- `edgeTypes: ['CALLS']` - "What functions would break if I change this function's signature?"
- `edgeTypes: ['USES_TYPE']` - "What code uses this type?"
- `edgeTypes: ['EXTENDS', 'IMPLEMENTS']` - "What classes inherit from this?"

### P3: Expose Module Filtering (Medium Impact)

**Problem**: Similar to edge types, `query.ts` supports `moduleFilter` internally but it's not exposed in the MCP interface.

**Recommended**: Allow users to limit impact analysis to specific modules:

```typescript
moduleFilter: {
  type: 'string',
  description: 'Limit impact analysis to a specific module'
}
```

### P4: Impact Severity Indicators (Medium Impact)

**Problem**: All impacted nodes are shown equally, but some impacts are more severe than others.

**Impact severity levels**:
- **Direct** (depth 1): Immediate callers/users - high confidence impact
- **Indirect** (depth 2-3): Transitive dependents - medium confidence
- **Distant** (depth 4+): Far transitive - may need review

**Enhanced output**:
```
Impact Analysis: src/utils.ts:formatDate

🔴 Direct Impact (3 nodes):
├── Function: renderReport (src/reports.ts)
├── Function: displayTimestamp (src/ui.ts)
└── Method: User.getCreatedAt (src/models/User.ts)

🟡 Indirect Impact (5 nodes):
├── Function: generatePDF (src/export.ts) via renderReport
└── ...

🟢 Distant Impact (12 nodes):
└── ...
```

### P5: Impact Summary Statistics (Low Impact)

**Problem**: No high-level summary of impact scope.

**Recommended summary header**:
```
Impact Analysis: src/types.ts:User
─────────────────────────────────
Total affected: 23 nodes across 8 files
By type: 12 Functions, 8 Methods, 3 Classes
By module: core (15), api (5), models (3)
Max depth reached: 4
```

## Testing Gaps

1. **No input validation tests**
2. **Edge type filtering** (`edgeTypes` option) is untested
3. **Module filtering** (`moduleFilter` option) is untested
4. **Missing tests for**:
   - Circular dependencies in impact chain
   - Very high-impact nodes (stress test)
   - Impact analysis on different node types

## Implementation Roadmap

1. **Phase 1** (P1): Add comprehensive input validation
2. **Phase 2** (P2-P3): Expose existing edgeTypes and moduleFilter options in MCP interface
3. **Phase 3** (P4-P5): Add severity indicators and summary statistics
