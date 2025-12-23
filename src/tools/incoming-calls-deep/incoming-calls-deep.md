# incomingCallsDeep

Find all functions/methods that call a target. Reverse call graph traversal (transitive).

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
| `symbol` | string | Yes | Target symbol name (e.g., `formatDate`, `User.save`) |
| `file` | string | No | Narrow scope to a specific file |
| `module` | string | No | Narrow scope to a specific module |
| `package` | string | No | Narrow scope to a specific package |
| `maxDepth` | number | No | Traversal depth 1-100 (default: 100) |

### Symbol Resolution

If multiple symbols match the name, the tool returns candidates for disambiguation. Use `file`, `module`, or `package` to narrow scope.

**Disambiguation example:**

```
Multiple matches for "save":
candidates:
  - save (Method) in src/models/User.ts
    offset: 45, limit: 15
    module: core, package: models
  - save (Function) in src/utils/storage.ts
    offset: 12, limit: 8
    module: core, package: utils

Narrow your query with: file, module, or package parameter
```

### Depth Examples

- `maxDepth: 1` - Direct callers only
- `maxDepth: 2` - Direct + callers of callers
- `maxDepth: 100` - Full transitive closure

## Output Format

```
target: formatDate (Function)
file: src/utils.ts
offset: 15 limit: 6
count: 3

src/main.ts (3 callers):
  functions[3]:
    caller [5-7] exp () → void
      offset: 5 limit: 3
    multiCaller [9-12] exp () → void
      offset: 9 limit: 4
    anotherCaller [14-16] exp () → void
      offset: 14 limit: 3
```

### Read Tool Parameters

Each caller includes `offset` and `limit` fields that can be passed directly to the Read tool.

## Examples

### Direct callers only

```json
{
  "symbol": "formatDate",
  "maxDepth": 1
}
```

### Full transitive callers

```json
{
  "symbol": "getConnection",
  "module": "db"
}
```

### Disambiguate with file

```json
{
  "symbol": "save",
  "file": "src/models/User.ts"
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

- `outgoingCallsDeep` - Forward call graph (what does this call?)
- `analyzeImpact` - Broader impact (all edge types)
- `findPaths` - Specific path between nodes
