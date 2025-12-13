# Issue: Field Redundancy Across All Tools

## Summary

Multiple fields contain information that is derivable from other fields, causing significant token waste.

## Issue 1: `filePath` is Redundant with `id`

### Current Behavior

Every node includes both `id` and `filePath`:

```
interfaces[11]{extends,id,name,module,package,filePath,startLine,endLine,exported}:
  "","src/db/Types.ts:BaseNode",BaseNode,ts-graph-mcp,main,src/db/Types.ts,24,51,true
       ^^^^^^^^^^^^^^^^^^^^^^^^                          ^^^^^^^^^^^^^^^^^
       id contains filePath                              filePath repeated
```

### The Problem

The `id` format is `{filePath}:{symbolPath}`. The `filePath` can be trivially extracted:

```typescript
const filePath = id.split(':')[0];  // "src/db/Types.ts"
```

### Real Example (from search_nodes)

```
interfaces[11]{extends,id,name,module,package,filePath,...}:
  "","src/db/Types.ts:BaseNode",BaseNode,ts-graph-mcp,main,src/db/Types.ts,...
  BaseNode,"src/db/Types.ts:FunctionNode",FunctionNode,ts-graph-mcp,main,src/db/Types.ts,...
  BaseNode,"src/db/Types.ts:ClassNode",ClassNode,ts-graph-mcp,main,src/db/Types.ts,...
  BaseNode,"src/db/Types.ts:MethodNode",MethodNode,ts-graph-mcp,main,src/db/Types.ts,...
```

**Token waste:** `src/db/Types.ts` appears 22 times (once in `id`, once in `filePath`) × 11 rows = ~200 wasted characters

### Recommendation

Remove `filePath` field entirely. Clients extract it from `id`.

---

## Issue 2: `name` is Redundant with `id`

### Current Behavior

Every node includes both `id` and `name`:

```
interfaces[11]{extends,id,name,...}:
  "","src/db/Types.ts:BaseNode",BaseNode,...
                       ^^^^^^^^ ^^^^^^^^
                       in id    repeated as name
```

### The Problem

The `name` is the portion of `id` after the last `:`:

```typescript
const name = id.split(':').pop();  // "BaseNode"
```

### Real Example (from get_file_symbols)

```
typeAliases[4]{aliasedType,id,name,module,package,filePath,...}:
  "...","src/db/Types.ts:NodeType",NodeType,ts-graph-mcp,main,src/db/Types.ts,...
  "...","src/db/Types.ts:EdgeType",EdgeType,ts-graph-mcp,main,src/db/Types.ts,...
  "...","src/db/Types.ts:Node",Node,ts-graph-mcp,main,src/db/Types.ts,...
  "...","src/db/Types.ts:TraversalDirection",TraversalDirection,ts-graph-mcp,main,src/db/Types.ts,...
```

**Token waste:** Each name repeated twice × 4 rows = ~60 wasted characters (just for type aliases)

### Recommendation

Remove `name` field. Clients extract it from `id`.

---

## Issue 3: `module` and `package` Repeated for Every Node

### Current Behavior

All nodes in the same project repeat identical `module` and `package`:

```
interfaces[11]{...,module,package,...}:
  ...ts-graph-mcp,main,...
  ...ts-graph-mcp,main,...
  ...ts-graph-mcp,main,...  (×11 times)
```

### Real Example (from get_file_symbols on src/db/Types.ts)

88 symbols, ALL with:
- `module: ts-graph-mcp`
- `package: main`

**Token waste:** `ts-graph-mcp,main` × 88 = ~1,400 wasted characters

### Recommendation

See [07-hierarchical-output.md](./07-hierarchical-output.md) for the architectural solution.

Short-term: Hoist to top-level metadata when all values are identical.

---

## Combined Impact

For a typical `get_file_symbols` response with 88 symbols:

| Field | Waste per Symbol | Total Waste |
|-------|------------------|-------------|
| `filePath` | ~18 chars | ~1,584 chars |
| `name` | ~10 chars | ~880 chars |
| `module,package` | ~16 chars | ~1,408 chars |
| **TOTAL** | ~44 chars | **~3,872 chars** |

This represents approximately **40-50% of the total response size**.
