# Issue: Property Node Default Value Bloat

## Summary

Property nodes include 5 boolean/string fields that are almost always at their default values, wasting significant tokens.

## Real Example

**From:** `get_file_symbols({ filePath: "src/db/Types.ts" })`

```
properties[66]{propertyType,optional,readonly,visibility,static,id,name,module,package,filePath,startLine,endLine,exported}:
  string,false,false,"",false,"src/db/Types.ts:BaseNode.id",id,ts-graph-mcp,main,src/db/Types.ts,26,26,false
  NodeType,false,false,"",false,"src/db/Types.ts:BaseNode.type",type,ts-graph-mcp,main,src/db/Types.ts,29,29,false
  string,false,false,"",false,"src/db/Types.ts:BaseNode.name",name,ts-graph-mcp,main,src/db/Types.ts,32,32,false
  string,false,false,"",false,"src/db/Types.ts:BaseNode.module",module,ts-graph-mcp,main,src/db/Types.ts,35,35,false
  string,false,false,"",false,"src/db/Types.ts:BaseNode.package",package,ts-graph-mcp,main,src/db/Types.ts,38,38,false
  string,false,false,"",false,"src/db/Types.ts:BaseNode.filePath",filePath,ts-graph-mcp,main,src/db/Types.ts,41,41,false
  number,false,false,"",false,"src/db/Types.ts:BaseNode.startLine",startLine,ts-graph-mcp,main,src/db/Types.ts,44,44,false
  number,false,false,"",false,"src/db/Types.ts:BaseNode.endLine",endLine,ts-graph-mcp,main,src/db/Types.ts,47,47,false
  boolean,false,false,"",false,"src/db/Types.ts:BaseNode.exported",exported,ts-graph-mcp,main,src/db/Types.ts,50,50,false
  "\"Function\"",false,false,"",false,"src/db/Types.ts:FunctionNode.type",type,ts-graph-mcp,main,src/db/Types.ts,55,55,false
  "Array<{ name: string; type?: string }>",true,false,"",false,"src/db/Types.ts:FunctionNode.parameters",parameters,ts-graph-mcp,main,src/db/Types.ts,56,56,false
  ...
```

## Issues Identified

### Issue 1: `optional: false` (Default) Repeated 66 Times

Looking at the 66 properties:
- `optional: true` — only ~15 properties
- `optional: false` — ~51 properties (77%)

```
propertyType,optional,...}:
  string,false,...    ← default
  NodeType,false,...  ← default
  string,false,...    ← default
  "Array<...>",true,... ← actual value
  string,true,...     ← actual value
```

**Waste:** `false,` × 51 = ~255 characters

### Issue 2: `readonly: false` (Default) Repeated 66 Times

**ALL 66 properties** have `readonly: false`:

```
optional,readonly,...}:
  false,false,...  (×66)
        ^^^^^
        ALWAYS false
```

**Waste:** `false,` × 66 = ~330 characters

### Issue 3: `visibility: ""` (Default) Repeated 66 Times

**ALL 66 properties** have empty visibility (interface properties don't have visibility):

```
readonly,visibility,static,...}:
  false,"",false,...  (×66)
        ^^
        ALWAYS empty
```

**Waste:** `"",` × 66 = ~198 characters

### Issue 4: `static: false` (Default) Repeated 66 Times

**ALL 66 properties** have `static: false`:

```
visibility,static,...}:
  "",false,...  (×66)
     ^^^^^
     ALWAYS false
```

**Waste:** `false,` × 66 = ~330 characters

### Issue 5: `exported: false` (Always) for Properties

Properties **never** have their own export status — they inherit from their parent interface/class:

```
...,exported}:
  ...,false  (×66)
      ^^^^^
      ALWAYS false for properties
```

**Waste:** `false` × 66 = ~330 characters

### Issue 6: `startLine` Often Equals `endLine`

Most property declarations are single-line:

```
...,startLine,endLine,...}:
  ...,26,26,...  ← same line
  ...,29,29,...  ← same line
  ...,32,32,...  ← same line
```

**Recommendation:** Use single `line` field, or `line: "26"` / `line: "26-30"` format.

### Issue 7: `id` Contains Redundant Information

```
id,name,...}:
  "src/db/Types.ts:BaseNode.id",id,...
   ^^^^^^^^^^^^^^^^^^^^^^^^    ^^
   filePath + parent + name    just name
```

The `id` contains:
- `filePath` (already a separate field)
- Parent name (`BaseNode`)
- Property name (already in `name` field)

**Recommendation:** Add `parent` field, simplify `id` to just `parent.name`.

## Current TOON Header Waste

```
properties[66]{propertyType,optional,readonly,visibility,static,id,name,module,package,filePath,startLine,endLine,exported}:
```

13 fields in header × 66 rows = massive overhead.

## Recommended Optimized Format

### Sparse Encoding (Only Include Non-Defaults)

```
properties[66]{type,parent,name,line,?optional}:
  string,BaseNode,id,26
  NodeType,BaseNode,type,29
  string,BaseNode,name,32
  "Array<...>",FunctionNode,parameters,56,optional
  string,FunctionNode,returnType,57,optional
  ...
```

### Changes Made:
1. **Removed** `readonly`, `visibility`, `static`, `exported` — all always at defaults
2. **Removed** `module`, `package`, `filePath` — hoisted to file level
3. **Added** `parent` — extracted from `id`
4. **Simplified** `id` to just `parent.name` context (or removed entirely)
5. **Combined** `startLine`/`endLine` into single `line`
6. **Sparse** `optional` — only present when `true`

### Alternative: Separate Arrays by Optional Status

```
requiredProperties[51]{type,parent,name,line}:
  string,BaseNode,id,26
  NodeType,BaseNode,type,29
  ...

optionalProperties[15]{type,parent,name,line}:
  "Array<...>",FunctionNode,parameters,56
  string,FunctionNode,returnType,57
  ...
```

This uses TOON's array-name-implies-property pattern.

## Estimated Savings

| Field | Current Waste | After |
|-------|---------------|-------|
| `optional: false` | 255 chars | 0 (sparse) |
| `readonly: false` | 330 chars | 0 (removed) |
| `visibility: ""` | 198 chars | 0 (removed) |
| `static: false` | 330 chars | 0 (removed) |
| `exported: false` | 330 chars | 0 (removed) |
| `filePath` repeated | 1,188 chars | 0 (hoisted) |
| `module,package` repeated | 1,056 chars | 0 (hoisted) |
| **TOTAL** | **~3,687 chars** | **0** |

**Reduction: ~60-70%** for property nodes alone.
