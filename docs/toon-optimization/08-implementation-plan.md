# Implementation Plan: TOON Output Optimization

## Overview

This document consolidates all TOON optimization proposals into an actionable implementation plan.

**Target:** 50-70% additional token reduction beyond current TOON encoding.

**Prerequisites:** Read the analysis documents first:
- [01-field-redundancy.md](./01-field-redundancy.md) - Derivable fields
- [02-get-file-symbols.md](./02-get-file-symbols.md) - File context waste
- [03-find-path.md](./03-find-path.md) - Path response redundancy
- [04-get-neighbors.md](./04-get-neighbors.md) - Subgraph duplication
- [05-property-bloat.md](./05-property-bloat.md) - Property default values
- [06-file-node-bloat.md](./06-file-node-bloat.md) - File node fields
- [07-hierarchical-output.md](./07-hierarchical-output.md) - Hierarchical structure

---

## Critical Files

| File | Purpose |
|------|---------|
| `src/mcp/McpServer.ts:416-500` | TOON formatting functions |
| `src/mcp/McpServer.ts:537-596` | Response formatters |
| `tests/db/integration/ToonEncoding.test.ts` | TOON format tests |

---

## Phase 1: Quick Wins (Field Removal)

### 1.1 Remove Redundant Fields

**Modify:** `flattenNodeForToon()` at `src/mcp/McpServer.ts:416`

Skip these fields in the output:
- `filePath` → derivable from `id.split(':')[0]`
- `name` → derivable from `id.split(':').pop()`

### 1.2 Combine Line Numbers

**Modify:** `flattenNodeForToon()` at `src/mcp/McpServer.ts:416`

Replace `startLine`/`endLine` with single `line` field:
- Same line: `"26"`
- Range: `"24-51"`

### 1.3 Remove Property Defaults

**Modify:** `flattenNodeForToon()` at `src/mcp/McpServer.ts:416`

For Property nodes, skip always-default fields:
- `readonly` (always false)
- `visibility` (always "")
- `static` (always false)
- `exported` (always false for properties)

---

## Phase 2: find_path Optimization

**Modify:** `formatPathForToon()` at `src/mcp/McpServer.ts:506`

Remove derivable fields:
- `start` → equals `nodes[0]`
- `end` → equals `nodes[-1]`
- `length` → equals `edges.length`

Compact edges (remove `source`/`target` since order matches `nodes`):
```
edges[2]{type,?calls}:
  CALLS,5
  CALLS,1
```

---

## Phase 3: get_neighbors Optimization

**Modify:** `formatSubgraphForToon()` at `src/mcp/McpServer.ts:488`

Changes:
1. **Exclude center** from grouped node arrays
2. **Remove counts** (`nodeCount`, `edgeCount` derivable)
3. **Compact edges** (only include relevant metadata per edge type)

---

## Phase 4: Module/Package Hoisting

**Modify:** `formatNodesResponse()` at `src/mcp/McpServer.ts:537`

Detect single module/package case and hoist to top level:

```yaml
module: ts-graph-mcp
package: main
count: 88

interfaces[17]{extends,symbol,line,exported}:
  "",BaseNode,24-51,true
```

Logic:
1. Check if all nodes have same `module` and `package`
2. If yes: hoist to top level, exclude from per-node output
3. If no: use hierarchical grouping (Phase 5)

---

## Phase 5: Multi-Module Hierarchical Grouping

**Add new function:** `groupNodesByHierarchy()`

For cross-package queries, group by module → package → type:

```yaml
count: 150

ts-graph-mcp:
  main:
    functions[25]{...}:
  utils:
    functions[10]{...}

external-lib:
  core:
    classes[5]{...}:
```

See proposed implementation in [07-hierarchical-output.md](./07-hierarchical-output.md#implementation-considerations).

---

## Phase 6: get_file_symbols Special Handling

**Modify:** `get_file_symbols` case at `src/mcp/McpServer.ts:327`

Since user knows the file, use minimal format:
- Hoist `file`, `module`, `package` to top level
- Use symbol-only IDs (strip file prefix)
- Add `parent` field for properties (extracted from id)

---

## New Functions Required

| Function | Location | Purpose |
|----------|----------|---------|
| `flattenNodeCompact()` | `src/mcp/McpServer.ts` | Node without filePath, name, module, package |
| `flattenEdgeCompact()` | `src/mcp/McpServer.ts` | Edge without redundant fields |
| `groupNodesByHierarchy()` | `src/mcp/McpServer.ts` | Module → package → type grouping |
| `formatFileSymbolsResponse()` | `src/mcp/McpServer.ts` | Special handler for get_file_symbols |

---

## Testing Strategy

1. **Update** existing tests in `ToonEncoding.test.ts`
2. **Add tests** for:
   - Single module/package hoisting
   - Multi-module hierarchical output
   - Line range formatting
   - Path edge compaction
   - Center node exclusion
3. **Verify** TOON condensed format still used

---

## Estimated Savings

| Tool | Current | After | Savings |
|------|---------|-------|---------|
| `get_file_symbols` | ~8,500 chars | ~2,800 chars | **67%** |
| `search_nodes` | ~1,150 chars | ~650 chars | **43%** |
| `find_path` | ~450 chars | ~180 chars | **60%** |
| `get_neighbors` | ~850 chars | ~350 chars | **59%** |

**Combined with existing TOON (~60-70%), total vs raw JSON: ~85-90%**

---

## Implementation Order

Recommended sequence (each phase independently testable):

1. **Phase 1**: Quick wins - low risk, immediate benefit
2. **Phase 4**: Module/package hoisting - biggest single improvement
3. **Phase 2-3**: Tool-specific optimizations
4. **Phase 6**: get_file_symbols special handling
5. **Phase 5**: Multi-module hierarchical (only needed for cross-package)
