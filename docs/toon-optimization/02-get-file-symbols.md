# Issue: get_file_symbols Response Redundancy

## Summary

When a user calls `get_file_symbols(filePath: "src/db/Types.ts")`, they already know:
- The file path
- The module (derived from project config)
- The package (derived from project config)

Yet the response repeats this information for **every single symbol**.

## Real Example

**Request:** `get_file_symbols({ filePath: "src/db/Types.ts" })`

**Response (abbreviated):**

```
count: 88
files[1]{extension,id,name,module,package,filePath,startLine,endLine,exported}:
  .ts,src/db/Types.ts,Types.ts,ts-graph-mcp,main,src/db/Types.ts,1,233,false

interfaces[17]{extends,id,name,module,package,filePath,startLine,endLine,exported}:
  "","src/db/Types.ts:BaseNode",BaseNode,ts-graph-mcp,main,src/db/Types.ts,24,51,true
  BaseNode,"src/db/Types.ts:FunctionNode",FunctionNode,ts-graph-mcp,main,src/db/Types.ts,54,59,true
  BaseNode,"src/db/Types.ts:ClassNode",ClassNode,ts-graph-mcp,main,src/db/Types.ts,61,65,true
  ...

properties[66]{propertyType,optional,readonly,visibility,static,id,name,module,package,filePath,startLine,endLine,exported}:
  string,false,false,"",false,"src/db/Types.ts:BaseNode.id",id,ts-graph-mcp,main,src/db/Types.ts,26,26,false
  NodeType,false,false,"",false,"src/db/Types.ts:BaseNode.type",type,ts-graph-mcp,main,src/db/Types.ts,29,29,false
  ...
```

## Issues Identified

### Issue 1: `filePath` Repeated 88 Times

The user explicitly requested `src/db/Types.ts`. Why repeat it 88 times?

```
filePath,startLine,endLine,exported}:
  src/db/Types.ts,24,51,true    ← user already knows this!
  src/db/Types.ts,54,59,true    ← repeated
  src/db/Types.ts,61,65,true    ← repeated
  ... (×88)
```

**Waste:** ~18 chars × 88 = **1,584 characters**

### Issue 2: `module` and `package` Repeated 88 Times

All symbols in a file belong to the same module/package:

```
module,package,filePath,...}:
  ts-graph-mcp,main,src/db/Types.ts,...  (×88)
```

**Waste:** ~16 chars × 88 = **1,408 characters**

### Issue 3: `id` Contains Redundant File Prefix

Every `id` starts with `src/db/Types.ts:`:

```
id,name,...}:
  "src/db/Types.ts:BaseNode",BaseNode,...
  "src/db/Types.ts:FunctionNode",FunctionNode,...
  "src/db/Types.ts:ClassNode",ClassNode,...
```

For single-file context, only the symbol portion is needed.

**Waste:** ~18 chars × 88 = **1,584 characters**

### Issue 4: `files[1]` Entry is Questionable

```
files[1]{extension,id,name,module,package,filePath,startLine,endLine,exported}:
  .ts,src/db/Types.ts,Types.ts,ts-graph-mcp,main,src/db/Types.ts,1,233,false
```

Problems:
- `extension: .ts` — derivable from filePath
- `id: src/db/Types.ts` — same as filePath
- `name: Types.ts` — derivable from filePath (basename)
- `startLine: 1` — always 1 for files
- `exported: false` — files don't export themselves

**Question:** Does the user need the File node when they asked for "symbols in this file"?

## Recommended Optimized Response

```
file: src/db/Types.ts
module: ts-graph-mcp
package: main
lines: 1-233

interfaces[17]{extends,symbol,line,exported}:
  "",BaseNode,24-51,true
  BaseNode,FunctionNode,54-59,true
  BaseNode,ClassNode,61-65,true
  ...

properties[66]{type,optional,parent,name,line}:
  string,false,BaseNode,id,26
  NodeType,false,BaseNode,type,29
  ...
```

### Changes Made:
1. File metadata at top level (not repeated per symbol)
2. `symbol` instead of full `id` (file prefix removed)
3. `line` instead of `startLine,endLine` (combined when same, or `start-end`)
4. Removed `module`, `package`, `filePath` from each row
5. Removed `files[1]` entry (file info at top level)
6. Properties: removed always-false defaults (`readonly`, `visibility`, `static`)

### Estimated Savings

| Before | After | Savings |
|--------|-------|---------|
| ~8,500 chars | ~2,800 chars | **67% reduction** |
