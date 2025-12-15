# get_callers

Find all functions/methods that call a target. Reverse call graph traversal.

## Purpose

Answer: "Who calls this function?" Find both direct and transitive callers.

**Use cases:**
- Impact analysis before refactoring
- Finding all call sites
- Understanding dependencies
- Dead code detection (count: 0)

## Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `nodeId` | string | Yes | Target function ID (e.g., `src/utils.ts:formatDate`) |
| `maxDepth` | number | No | Traversal depth 1-100 (default: 100) |

### Depth Examples

- `maxDepth: 1` - Direct callers only
- `maxDepth: 2` - Direct + callers of callers
- `maxDepth: 100` - Full transitive closure

## Output Format

```
targetId: src/utils.ts:helper
count: 3

src/main.ts (3 callers):
  functions[3]:
    caller [5-7] exp () → void
    multiCaller [9-12] exp () → void
    anotherCaller [14-16] exp () → void
```

## Examples

### Direct callers only

```json
{
  "nodeId": "src/helper.ts:helper",
  "maxDepth": 1
}
```

### Full transitive callers

```json
{
  "nodeId": "src/db/connection.ts:getConnection"
}
```

## Implementation

Uses recursive CTE with cycle detection:

```sql
WITH RECURSIVE callers(id, depth) AS (
  SELECT source, 1 FROM edges WHERE target = ? AND type = 'CALLS'
  UNION
  SELECT e.source, c.depth + 1 FROM edges e
  JOIN callers c ON e.target = c.id
  WHERE e.type = 'CALLS' AND c.depth < ?
)
```

- Only traverses CALLS edges
- Handles cycles gracefully
- Returns distinct nodes

## Related Tools

- `get_callees` - Forward call graph (what does this call?)
- `get_impact` - Broader impact (all edge types)
- `find_path` - Specific path between nodes
