# analyzeImpact Tool Improvements

**Evaluation Grade: 8.5/10**

## Overview

The `analyzeImpact` tool performs impact analysis - finding all code that would be affected by changes to a target node. It traverses all edge types (CALLS, IMPORTS, USES_TYPE, EXTENDS, IMPLEMENTS) in the incoming direction to show the complete blast radius.

## Architecture

```
src/tools/analyze-impact/
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
| Non-existent node | ✅ Pass | Handled by symbol resolution |
| Node with no dependents | ✅ Pass | Clear "no impact" message |
| Utility function (high impact) | ✅ Pass | Correctly shows widespread usage |

## Priority Improvements

### P1: Impact Severity Indicators (Medium Impact)

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

### P2: Impact Summary Statistics (Low Impact)

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

## Design Decisions

### Why No Edge Type Filtering?

Impact analysis intentionally traverses **all edge types** because:

1. **Complete blast radius**: When changing a symbol, you want to know everything that depends on it, regardless of how (calls, type usage, inheritance, imports)

2. **No implementation leakage**: Exposing `edgeTypes: ["CALLS", "USES_TYPE"]` in the MCP API would leak internal graph concepts. AI agents shouldn't need to understand edge type semantics.

3. **Separate tools exist**: For focused analysis, use `incomingCallsDeep` (CALLS only), `incomingUsesType` (USES_TYPE only), or `incomingImports` (IMPORTS only).

### Why No Module Filtering?

1. **Cross-module impact is the most important signal**: If changing `User` breaks code in `api`, `auth`, AND `billing`, that's critical information.

2. **Filtering hides risk**: Module filtering would hide the most impactful changes (those affecting multiple modules).

3. **Post-process if needed**: Consumers can filter results themselves if they need module-specific views.

## Testing Gaps

1. **Missing tests for**:
   - Very high-impact nodes (stress test)
   - Impact analysis on different node types

## Implementation Roadmap

1. **Phase 1** (P1): Add severity indicators based on depth
2. **Phase 2** (P2): Add summary statistics header
