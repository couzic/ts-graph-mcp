# get_callees

Find all functions/methods called by a source. Forward call graph traversal.

## Purpose

Answer: "What does this function call?" Find both direct and transitive callees.

**Use cases:**
- Understanding dependencies
- Mapping execution flow
- Identifying deep call chains
- Finding leaf functions (count: 0)

## Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `nodeId` | string | Yes | Source function ID (e.g., `src/main.ts:startServer`) |
| `maxDepth` | number | No | Traversal depth 1-100 (default: 100) |

### Depth Examples

- `maxDepth: 1` - Direct callees only
- `maxDepth: 2` - Direct + callees of callees
- `maxDepth: 100` - Full call tree

## Output Format

```
sourceId: src/ingestion/Ingestion.ts:indexProject
count: 2

src/db/DbWriter.ts (1 callees):
  functions[1]:
    clearAll [15-20] exp async () → Promise<void>

src/ingestion/Ingestion.ts (1 callees):
  functions[1]:
    indexPackage [109-207] async (...) → Promise<IndexResult>
```

## Examples

### Direct callees only

```json
{
  "nodeId": "src/mcp/McpServer.ts:startServer",
  "maxDepth": 1
}
```

### Full call tree

```json
{
  "nodeId": "src/ingestion/Ingestion.ts:indexProject"
}
```

## Implementation

Uses recursive CTE with cycle detection:

```sql
WITH RECURSIVE callees(id, depth) AS (
  SELECT target, 1 FROM edges WHERE source = ? AND type = 'CALLS'
  UNION
  SELECT e.target, c.depth + 1 FROM edges e
  JOIN callees c ON e.source = c.id
  WHERE e.type = 'CALLS' AND c.depth < ?
)
```

- Only traverses CALLS edges
- Handles cycles (mutual recursion)
- Returns distinct nodes

## Tips

- High callee count = complex function (consider refactoring)
- Many callees, few callers = likely entry point
- Combine with `get_callers` for full picture

## Related Tools

- `get_callers` - Reverse call graph (what calls this?)
- `get_impact` - Broader impact (all edge types)
- `get_neighbors` - Local subgraph extraction
