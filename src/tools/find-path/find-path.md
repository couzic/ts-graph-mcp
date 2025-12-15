# find_path

Find the shortest path between two nodes in the code graph.

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
| `sourceId` | string | Yes | Starting node ID |
| `targetId` | string | Yes | Ending node ID |

## Output Format

### Path Found

```
sourceId: src/chain.ts:funcA
targetId: src/chain.ts:funcC
found: true
length: 2

path: src/chain.ts:funcA --CALLS--> src/chain.ts:funcB --CALLS--> src/chain.ts:funcC
```

### No Path

```
sourceId: src/isolated.ts:funcX
targetId: src/other.ts:funcY
found: false

(no path exists between these nodes)
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
  "sourceId": "src/main.ts:chain",
  "targetId": "src/helper.ts:helper"
}
```

Output:
```
path: main.ts:chain --CALLS--> chained.ts:intermediate --CALLS--> helper.ts:helper
```

### Type usage

```json
{
  "sourceId": "src/models.ts:UserService.addUser",
  "targetId": "src/types.ts:User"
}
```

Output:
```
path: UserService.addUser --USES_TYPE--> User
```

## Path Length Insights

| Length | Meaning |
|--------|---------|
| 1 | Direct connection |
| 2-3 | Typical dependency chain |
| 4+ | Complex indirect dependency |

## Important Notes

1. **Directional** - Path from A→B doesn't imply B→A exists
2. **Shortest only** - Returns one path even if multiple exist
3. **Max depth 20** - Prevents performance issues
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
