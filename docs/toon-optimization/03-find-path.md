# Issue: find_path Response Redundancy

## Summary

The `find_path` response contains multiple redundant fields that can be derived from other data.

## Real Example

**Request:** `find_path({ sourceId: "src/mcp/McpServer.ts:startMcpServer", targetId: "src/mcp/McpServer.ts:groupNodesByType" })`

**Response:**

```
found: true
path:
  start: "src/mcp/McpServer.ts:startMcpServer"
  end: "src/mcp/McpServer.ts:groupNodesByType"
  nodes[3]: "src/mcp/McpServer.ts:startMcpServer","src/mcp/McpServer.ts:formatNodesResponse","src/mcp/McpServer.ts:groupNodesByType"
  edges[2]{source,target,type,callCount}:
    "src/mcp/McpServer.ts:startMcpServer","src/mcp/McpServer.ts:formatNodesResponse",CALLS,5
    "src/mcp/McpServer.ts:formatNodesResponse","src/mcp/McpServer.ts:groupNodesByType",CALLS,1
  length: 2
```

## Issues Identified

### Issue 1: `start` and `end` Duplicate `nodes[0]` and `nodes[-1]`

```
start: "src/mcp/McpServer.ts:startMcpServer"           ← same as nodes[0]
end: "src/mcp/McpServer.ts:groupNodesByType"           ← same as nodes[2]
nodes[3]: "...startMcpServer","...formatNodesResponse","...groupNodesByType"
          ^^^^^^^^^^^^^^^^                             ^^^^^^^^^^^^^^^^^^
```

**Derivation:**
```typescript
const start = nodes[0];
const end = nodes[nodes.length - 1];
```

**Waste:** ~100 characters (two full node IDs)

### Issue 2: Edge `source` and `target` Duplicate Node Order

```
nodes[3]: "A", "B", "C"
edges[2]{source,target,type,callCount}:
  "A","B",CALLS,5    ← source=nodes[0], target=nodes[1]
  "B","C",CALLS,1    ← source=nodes[1], target=nodes[2]
```

**Pattern:** Edge `i` always connects `nodes[i]` → `nodes[i+1]`

**Derivation:**
```typescript
edges.forEach((edge, i) => {
  edge.source = nodes[i];
  edge.target = nodes[i + 1];
});
```

**Waste:** ~160 characters (two node IDs × 2 edges)

### Issue 3: `length` Equals `edges.length`

```
edges[2]{...}:
  ...
  ...
length: 2    ← always equals edges.length
```

**Derivation:**
```typescript
const length = edges.length;  // or nodes.length - 1
```

**Waste:** ~10 characters

### Issue 4: `callCount` Questionable for Path Finding

```
edges[2]{source,target,type,callCount}:
  "...","...",CALLS,5
  "...","...",CALLS,1
```

**Question:** For path finding, the user wants to know "is there a path?" and "what's the shortest path?". Call frequency is typically not relevant.

**If kept:** At least it's uniform (CALLS edges have counts). But consider if it adds value.

## Recommended Optimized Response

### Option A: Minimal (Maximum Compression)

```
found: true
nodes[3]: "src/mcp/McpServer.ts:startMcpServer","src/mcp/McpServer.ts:formatNodesResponse","src/mcp/McpServer.ts:groupNodesByType"
edgeTypes[2]: CALLS,CALLS
```

- Edges derived from node adjacency
- `start` = `nodes[0]`, `end` = `nodes[-1]`, `length` = `edgeTypes.length`

### Option B: Preserve Call Counts (If Useful)

```
found: true
nodes[3]: "src/mcp/McpServer.ts:startMcpServer","src/mcp/McpServer.ts:formatNodesResponse","src/mcp/McpServer.ts:groupNodesByType"
edges[2]{type,calls}:
  CALLS,5
  CALLS,1
```

- Edge `i` implicitly connects `nodes[i]` → `nodes[i+1]`
- Removed `source`, `target` from edges

## Estimated Savings

| Before | After (Option A) | Savings |
|--------|------------------|---------|
| ~450 chars | ~180 chars | **60% reduction** |

| Before | After (Option B) | Savings |
|--------|------------------|---------|
| ~450 chars | ~210 chars | **53% reduction** |
