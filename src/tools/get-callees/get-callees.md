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
| `symbol` | string | Yes | Source symbol name (e.g., `startServer`, `indexProject`) |
| `file` | string | No | Narrow scope to a specific file |
| `module` | string | No | Narrow scope to a specific module |
| `package` | string | No | Narrow scope to a specific package |
| `maxDepth` | number | No | Traversal depth 1-100 (default: 100) |

### Symbol Resolution

If multiple symbols match the name, the tool returns candidates for disambiguation. Use `file`, `module`, or `package` to narrow scope.

**Disambiguation example:**

```
Multiple matches for "process":
candidates:
  - process (Function) in src/worker.ts
    offset: 20, limit: 30
    module: core, package: worker
  - process (Method) in src/Queue.ts
    offset: 45, limit: 12
    module: core, package: queue

Narrow your query with: file, module, or package parameter
```

### Depth Examples

- `maxDepth: 1` - Direct callees only
- `maxDepth: 2` - Direct + callees of callees
- `maxDepth: 100` - Full call tree

## Output Format

```
source: indexProject (Function)
file: src/ingestion/Ingestion.ts
offset: 50 limit: 150
count: 2

src/db/DbWriter.ts (1 callees):
  functions[1]:
    clearAll [15-20] exp async () → Promise<void>
      offset: 15 limit: 6

src/ingestion/Ingestion.ts (1 callees):
  functions[1]:
    indexPackage [109-207] async (...) → Promise<IndexResult>
      offset: 109 limit: 99
```

### Read Tool Parameters

Each callee includes `offset` and `limit` fields that can be passed directly to the Read tool.

## Examples

### Direct callees only

```json
{
  "symbol": "startServer",
  "maxDepth": 1
}
```

### Full call tree

```json
{
  "symbol": "indexProject",
  "module": "ingestion"
}
```

### Disambiguate with file

```json
{
  "symbol": "process",
  "file": "src/worker.ts"
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
