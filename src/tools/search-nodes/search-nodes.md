# search_nodes

Search for nodes by name pattern with optional filters. Returns matching nodes grouped by file and type.

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
| `nodeType` | string | No | Filter: `Function`, `Class`, `Method`, `Interface`, `TypeAlias`, `Variable`, `File`, `Property` |
| `module` | string | No | Filter by module name |
| `package` | string | No | Filter by package name |
| `exported` | boolean | No | Filter by export status |

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

interfaces[N]:
  <name> [<lines>] exp extends:[Base]
```

### Symbol Annotations

- `exp` - exported
- `async` - async function/method
- `private`/`protected` - visibility
- `static` - static method
- `ro` - readonly property
- `?` - optional property
- `const` - const variable

## Examples

### Find handlers

```json
{ "pattern": "handle*" }
```

### Find exported classes

```json
{ "pattern": "*Service", "nodeType": "Class", "exported": true }
```

### Find functions in module

```json
{ "pattern": "*", "nodeType": "Function", "module": "utils" }
```

## Implementation

- Uses SQLite `GLOB` for pattern matching
- Filters combine with AND
- Groups by file, then by type
- ~60-70% token reduction vs JSON

## Related Tools

- `get_file_symbols` - List all symbols in a file
- `get_neighbors` - Explore relationships around a node
- `get_impact` - Find what depends on a symbol
