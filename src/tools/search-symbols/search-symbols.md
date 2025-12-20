# searchSymbols

Search for symbols by name pattern with optional filters. Returns matching nodes grouped by file and type.

## Purpose

Find code symbols (functions, classes, interfaces, types, etc.) by name pattern using glob matching.

**Use cases:**
- Finding event handlers: `handle*`
- Locating service classes: `*Service`
- Discovering exported API: `*` with `exported: true`
- Module inventory: `*` with `module` filter

## Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `pattern` | string | Yes | Glob pattern (supports `*` and `?`). Case-sensitive. |
| `type` | string | No | Filter: `Function`, `Class`, `Method`, `Interface`, `TypeAlias`, `Variable`, `File`, `Property` |
| `module` | string | No | Filter by module name |
| `package` | string | No | Filter by package name |
| `exported` | boolean | No | Filter by export status |
| `offset` | number | No | Skip first N results for pagination |
| `limit` | number | No | Max results to return (default: 100) |

## Pattern Matching

| Pattern | Matches |
|---------|---------|
| `foo*` | Names starting with "foo" |
| `*Service` | Names ending with "Service" |
| `fn?` | "fn" + exactly one char |
| `*` | All nodes |

## Output Format

```
count: <total>
files: <file count>

file: <path>
module: <module>
package: <package>
matches: <count>

functions[N]:
  <name> [<lines>] exp async (<params>) → <returnType>
  offset: <line> limit: <count>

interfaces[N]:
  <name> [<lines>] exp extends:[Base]
  offset: <line> limit: <count>
```

### Symbol Annotations

- `exp` - exported
- `async` - async function/method
- `private`/`protected` - visibility
- `static` - static method
- `ro` - readonly property
- `?` - optional property
- `const` - const variable

### Read Tool Parameters

Each symbol includes `offset` and `limit` fields that can be passed directly to the Read tool:
- `offset` - Line number to start reading (1-indexed)
- `limit` - Number of lines to read

## Examples

### Find handlers

```json
{ "pattern": "handle*" }
```

### Find exported classes

```json
{ "pattern": "*Service", "type": "Class", "exported": true }
```

### Find functions in module

```json
{ "pattern": "*", "type": "Function", "module": "utils" }
```

### Paginated search

```json
{ "pattern": "*", "limit": 50, "offset": 0 }
```

## Implementation

- Uses SQLite `GLOB` for pattern matching
- Filters combine with AND
- Groups by file, then by type
- ~60-70% token reduction vs JSON

## Related Tools

- `getNeighborhood` - Explore relationships around a symbol
- `analyzeImpact` - Find what depends on a symbol
