# Issue: get_neighbors Response Redundancy

## Summary

The `get_neighbors` subgraph response contains duplicated nodes, derivable counts, and inefficient edge encoding.

## Real Example

**Request:** `get_neighbors({ nodeId: "src/db/Types.ts:Node", distance: 1 })`

**Response:**

```
center:
  aliasedType: | FunctionNode | ClassNode | MethodNode | InterfaceNode | TypeAliasNode | VariableNode | FileNode | PropertyNode
  id: "src/db/Types.ts:Node"
  name: Node
  module: ts-graph-mcp
  package: main
  filePath: src/db/Types.ts
  startLine: 104
  endLine: 112
  exported: true
nodeCount: 2
edgeCount: 1
typeAliases[1]{aliasedType,id,name,module,package,filePath,startLine,endLine,exported}:
  | FunctionNode | ClassNode | MethodNode | InterfaceNode | TypeAliasNode | VariableNode | FileNode | PropertyNode,"src/db/Types.ts:Node",Node,ts-graph-mcp,main,src/db/Types.ts,104,112,true
files[1]{extension,id,name,module,package,filePath,startLine,endLine,exported}:
  .ts,src/db/Types.ts,Types.ts,ts-graph-mcp,main,src/db/Types.ts,1,233,false
edges[1]{source,target,type,callCount}:
  src/db/Types.ts,"src/db/Types.ts:Node",CONTAINS,""
```

## Issues Identified

### Issue 1: Center Node Duplicated in Type Array

The center node appears **twice**:

```
center:
  aliasedType: | FunctionNode | ClassNode | ...
  id: "src/db/Types.ts:Node"
  name: Node
  ...

typeAliases[1]{...}:
  | FunctionNode | ClassNode | ...,"src/db/Types.ts:Node",Node,...
  ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
  EXACT DUPLICATE of center
```

**Waste:** ~200 characters (entire node repeated)

**Recommendation:** Exclude center node from grouped arrays, or replace with `"@center"` reference.

### Issue 2: `nodeCount` and `edgeCount` are Derivable

```
nodeCount: 2    ← = typeAliases.length + files.length = 1 + 1 = 2
edgeCount: 1    ← = edges.length = 1
```

**Derivation:**
```typescript
const nodeCount = Object.entries(result)
  .filter(([k]) => !['center', 'edges', 'nodeCount', 'edgeCount'].includes(k))
  .reduce((sum, [_, arr]) => sum + arr.length, 0);
const edgeCount = edges.length;
```

**Waste:** ~25 characters

### Issue 3: Edge `callCount` Empty for Non-CALLS Edges

```
edges[1]{source,target,type,callCount}:
  src/db/Types.ts,"src/db/Types.ts:Node",CONTAINS,""
                                                  ^^
                                                  always empty for CONTAINS
```

This edge is a `CONTAINS` relationship. `callCount` only applies to `CALLS` edges.

**Real example with more edges:**
```
edges[26]{source,target,type,callCount}:
  src/db/DbReader.ts,src/db/Types.ts,IMPORTS,""         ← callCount irrelevant
  src/mcp/McpServer.ts,src/db/DbReader.ts,IMPORTS,""    ← callCount irrelevant
  src/mcp/McpServer.ts,"...:flattenNodeForToon",CONTAINS,""  ← callCount irrelevant
  "...:formatSubgraphForToon","...:flattenNodeForToon",CALLS,1  ← only CALLS uses it
```

**Recommendation:** Split edges by type or omit `callCount` for non-CALLS edges.

### Issue 4: File Node Bloat

```
files[1]{extension,id,name,module,package,filePath,startLine,endLine,exported}:
  .ts,src/db/Types.ts,Types.ts,ts-graph-mcp,main,src/db/Types.ts,1,233,false
```

For File nodes:
- `extension: .ts` — derivable from filePath
- `id: src/db/Types.ts` — identical to filePath
- `name: Types.ts` — derivable from filePath (basename)
- `startLine: 1` — always 1
- `exported: false` — files don't export themselves

See [06-file-node-bloat.md](./06-file-node-bloat.md) for details.

### Issue 5: Field Redundancy (General)

Same issues as all tools:
- `filePath` derivable from `id`
- `name` derivable from `id`
- `module`/`package` repeated for same-file nodes

See [01-field-redundancy.md](./01-field-redundancy.md).

## Recommended Optimized Response

```
center: "src/db/Types.ts:Node"
centerType: TypeAlias
centerData:
  aliasedType: | FunctionNode | ClassNode | MethodNode | ...
  line: 104-112
  exported: true

files[1]: src/db/Types.ts

edges[1]{from,to,type}:
  src/db/Types.ts,Node,CONTAINS
```

### Changes Made:
1. Center is just the ID, with type and minimal data
2. Removed center duplication in type arrays
3. Removed `nodeCount`/`edgeCount` (derivable)
4. Simplified file nodes to just paths
5. Edges: removed `callCount` (not a CALLS edge), shortened field names
6. Edge targets use symbol name only when in same file as source

## Estimated Savings

| Before | After | Savings |
|--------|-------|---------|
| ~850 chars | ~350 chars | **59% reduction** |
