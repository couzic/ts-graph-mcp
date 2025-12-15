# get_file_symbols

Get all symbols (functions, classes, interfaces, etc.) defined in a file.

## Purpose

Answer: "What's in this file?" Quick overview without reading source.

**Use cases:**
- File overview
- API discovery
- Code navigation
- Interface exploration

## Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `filePath` | string | Yes | Relative file path (e.g., `src/db/Types.ts`) |

## Output Format

```
module: ts-graph-mcp
package: main
filePath: src/db/Types.ts
count: 88

interfaces[17]:
  BaseNode [24-51] exp
  FunctionNode [54-59] exp extends:[BaseNode]
  ...

typeAliases[5]:
  NodeType [176] exp = "Function" | "Class" | ...
  Node [186] exp = FunctionNode | ClassNode | ...

properties[66]:
  BaseNode.id [26]: string
  BaseNode.type [29]: NodeType
  ...
```

### Symbol Annotations

**Functions:**
```
greet [10-15] exp async (name:string) → string
```

**Classes:**
```
User [10-50] exp extends:Base implements:[Serializable]
```

**Methods:**
```
User.save [20-25] private static async () → Promise<void>
```

**Interfaces:**
```
FunctionNode [54-59] exp extends:[BaseNode]
```

**Properties:**
```
User.email? [6] ro: string
```
- `?` = optional
- `ro` = readonly

## Examples

### Type definitions file

```json
{ "filePath": "src/db/Types.ts" }
```

### Handler file

```json
{ "filePath": "src/tools/search-nodes/handler.ts" }
```

### Non-existent file

```json
{ "filePath": "nonexistent.ts" }
```

Output:
```
filePath: nonexistent.ts
count: 0

(no symbols found)
```

## Tips

1. **Find exported API** - Look for `exp` markers
2. **Navigate by line** - Use `[start-end]` to jump to code
3. **Understand types** - Check `extends` relationships
4. **Discover signatures** - Parameters and returns shown inline

## Implementation

Simple query:
```sql
SELECT * FROM nodes WHERE file_path = ?
```

- Groups by type
- Hoists common metadata
- ~60-70% token reduction vs JSON

## Related Tools

- `search_nodes` - Find symbols across files by pattern
- `get_neighbors` - Explore relationships from a symbol
- `get_callers` - Find callers of a function
