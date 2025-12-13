# Issue: File Node Bloat

## Summary

File nodes include multiple fields that are either derivable from other fields or meaningless for files.

## Real Example

**From:** `get_neighbors` and `get_file_symbols`

```
files[1]{extension,id,name,module,package,filePath,startLine,endLine,exported}:
  .ts,src/db/Types.ts,Types.ts,ts-graph-mcp,main,src/db/Types.ts,1,233,false
```

## Issues Identified

### Issue 1: `id` Equals `filePath` for Files

For File nodes, the `id` is just the file path (no symbol component):

```
id,name,module,package,filePath,...}:
  src/db/Types.ts,...,src/db/Types.ts,...
  ^^^^^^^^^^^^^^^     ^^^^^^^^^^^^^^^
  IDENTICAL
```

**Waste:** ~18 characters per file

### Issue 2: `extension` Derivable from `filePath`

```
extension,id,name,...,filePath,...}:
  .ts,...,src/db/Types.ts,...
  ^^^                  ^^
  derivable from filePath.split('.').pop()
```

**Derivation:**
```typescript
const extension = '.' + filePath.split('.').pop();  // ".ts"
```

**Waste:** ~3 characters per file

### Issue 3: `name` Derivable from `filePath`

```
extension,id,name,...,filePath,...}:
  .ts,src/db/Types.ts,Types.ts,...,src/db/Types.ts,...
                      ^^^^^^^^     ^^^^^^^^^^^^^^^
                      basename of filePath
```

**Derivation:**
```typescript
const name = filePath.split('/').pop();  // "Types.ts"
```

**Waste:** ~10 characters per file

### Issue 4: `startLine: 1` Always for Files

Files always start at line 1:

```
...,startLine,endLine,...}:
  ...,1,233,...
      ^
      ALWAYS 1
```

**Waste:** ~2 characters per file (the "1,")

### Issue 5: `exported: false` Meaningless for Files

Files don't have an "exported" concept — only symbols within files can be exported:

```
...,exported}:
  ...,false
      ^^^^^
      ALWAYS false, meaningless
```

**Waste:** ~5 characters per file

### Issue 6: `endLine` Questionable Utility

```
...,startLine,endLine,...}:
  ...,1,233,...
        ^^^
        Total lines in file
```

**Question:** When is "file has 233 lines" useful information for an LLM analyzing code structure?

For impact analysis or neighbor queries, knowing file size is rarely relevant.

**Recommendation:** Omit for most tools, or provide as optional metadata.

## Recommended Optimized Format

### Minimal (Just Path)

For most tools, a file node only needs to convey "this file exists":

```
files[1]: src/db/Types.ts
```

Or with module/package context:

```
files[1]{path,module,package}:
  src/db/Types.ts,ts-graph-mcp,main
```

### With Line Count (If Needed)

```
files[1]{path,lines}:
  src/db/Types.ts,233
```

## Current vs Proposed

### Current (9 fields, ~95 chars per file):
```
files[1]{extension,id,name,module,package,filePath,startLine,endLine,exported}:
  .ts,src/db/Types.ts,Types.ts,ts-graph-mcp,main,src/db/Types.ts,1,233,false
```

### Proposed (1-3 fields, ~20-40 chars per file):
```
files[1]{path}:
  src/db/Types.ts
```

Or with hierarchy (see [07-hierarchical-output.md](./07-hierarchical-output.md)):
```
# File info at top level, no files[] array needed
module: ts-graph-mcp
package: main
file: src/db/Types.ts
```

## Estimated Savings

| Field | Current | After | Savings |
|-------|---------|-------|---------|
| `id` | 18 chars | 0 | 18 chars |
| `extension` | 3 chars | 0 | 3 chars |
| `name` | 10 chars | 0 | 10 chars |
| `startLine` | 2 chars | 0 | 2 chars |
| `exported` | 5 chars | 0 | 5 chars |
| `endLine` | 3 chars | 0-3 | 0-3 chars |
| **Per File** | ~95 chars | ~20 chars | **~75 chars (79%)** |

For a response with 17 files (like `get_impact`):
- **Current:** ~1,615 characters
- **Proposed:** ~340 characters
- **Savings:** ~1,275 characters (79%)
