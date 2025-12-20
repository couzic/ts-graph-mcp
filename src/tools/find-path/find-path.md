# find_path

Find the shortest path between two symbols in the code graph.

## Purpose

Answer: "How are these two pieces of code connected?"

**Use cases:**
- Understanding connection chains
- Tracing data/control flow
- Discovering unexpected dependencies
- Analyzing relationships

## Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `from` | object | Yes | Source symbol query |
| `from.symbol` | string | Yes | Symbol name (e.g., `formatDate`, `User.save`) |
| `from.file` | string | No | Narrow scope to a file |
| `from.module` | string | No | Narrow scope to a module |
| `from.package` | string | No | Narrow scope to a package |
| `to` | object | Yes | Target symbol query |
| `to.symbol` | string | Yes | Symbol name (e.g., `formatDate`, `User.save`) |
| `to.file` | string | No | Narrow scope to a file |
| `to.module` | string | No | Narrow scope to a module |
| `to.package` | string | No | Narrow scope to a package |
| `maxDepth` | number | No | Maximum path length (1-100, default: 20) |
| `maxPaths` | number | No | Maximum paths to return (1-10, default: 3) |

## Output Format

### Path Found

```
from: funcA (Function)
file: src/chain.ts
offset: 10
limit: 5

to: funcC (Function)
file: src/chain.ts
offset: 25
limit: 4

found: true
length: 2

path: funcA --CALLS--> funcB --CALLS--> funcC
```

### No Path

```
from: funcX (Function)
file: src/isolated.ts
offset: 5
limit: 3

to: funcY (Function)
file: src/other.ts
offset: 12
limit: 4

found: false

(no path exists between these symbols)
```

## Edge Types in Paths

- **CALLS** - Function invocations
- **IMPORTS** - File imports
- **CONTAINS** - File contains symbol
- **USES_TYPE** - Type references
- **EXTENDS** - Inheritance
- **IMPLEMENTS** - Interface implementation
- **READS_PROPERTY** - Property access
- **WRITES_PROPERTY** - Property assignment

## Examples

### Call chain

```json
{
  "from": { "symbol": "chain", "file": "src/main.ts" },
  "to": { "symbol": "helper", "file": "src/helper.ts" }
}
```

Output:
```
path: chain --CALLS--> intermediate --CALLS--> helper
```

### Type usage

```json
{
  "from": { "symbol": "UserService.addUser" },
  "to": { "symbol": "User" }
}
```

Output:
```
path: UserService.addUser --USES_TYPE--> User
```

### With scope filters

```json
{
  "from": { "symbol": "processData", "module": "core" },
  "to": { "symbol": "validateInput", "module": "validators" }
}
```

## Path Length Insights

| Length | Meaning |
|--------|---------|
| 1 | Direct connection |
| 2-3 | Typical dependency chain |
| 4+ | Complex indirect dependency |

## Important Notes

1. **Directional** - Path from A→B doesn't imply B→A exists
2. **Multiple paths** - Returns up to `maxPaths` paths (default: 3)
3. **Max depth 20** - Default limit prevents performance issues
4. **All edge types** - Not limited to CALLS

## Algorithm

- Uses BFS (breadth-first search)
- Cycle detection prevents infinite loops
- Returns first path found (shortest)

## Related Tools

- `get_callers` - All callers (not just path)
- `get_callees` - All callees (not just path)
- `get_neighbors` - Local subgraph
- `get_impact` - Full impact analysis
