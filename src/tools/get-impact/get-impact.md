# get_impact

Impact analysis: find all code affected by changes to a target node.

## Purpose

Answer: "If I change this, what else breaks?" Essential for safe refactoring.

**Use cases:**
- Safe refactoring planning
- Change scope estimation
- Dependency analysis
- Risk assessment

## Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `nodeId` | string | Yes | Node to analyze (e.g., `src/db/Types.ts:Node`) |
| `maxDepth` | number | No | Traversal depth 1-100 (default: 100) |

## Output Format

```
targetId: src/db/Types.ts:Node
count: 42

src/tools/get-callers/format.ts (8 impacted):
  functions[8]:
    formatFunction [39-48] exp (node:Node & {...}) → string
    formatClass [53-62] exp (node:Node & {...}) → string
    ...
```

## Edge Types Traversed

Unlike `get_callers` (CALLS only), impact analysis follows ALL incoming edges:

- **CALLS** - Functions that call the target
- **USES_TYPE** - Code using the type
- **EXTENDS** - Classes/interfaces extending target
- **IMPLEMENTS** - Classes implementing target
- **IMPORTS** - Files importing from target

## Examples

### Impact of a core type

```json
{ "nodeId": "src/db/Types.ts:Node" }
```
→ Shows 42+ impacted nodes (high risk change)

### Impact of interface

```json
{ "nodeId": "src/db/DbWriter.ts:DbWriter" }
```
→ Shows all functions with `DbWriter` parameter

### Direct dependents only

```json
{ "nodeId": "src/utils.ts:helper", "maxDepth": 1 }
```
→ Immediate dependencies only

### Dead code check

```json
{ "nodeId": "src/deprecated.ts:oldFunction" }
```
→ count: 0 means safe to delete

## Safe Refactoring Workflow

1. **Before changing a function:**
   ```json
   { "nodeId": "src/utils.ts:formatDate" }
   ```
   Review all dependents

2. **Before changing an interface:**
   ```json
   { "nodeId": "src/db/Types.ts:Node" }
   ```
   Understand full impact

3. **Before removing code:**
   Verify count is 0 (no dependents)

## Implementation

Uses recursive CTE traversing incoming edges:

```sql
WITH RECURSIVE impacted(id, depth) AS (
  SELECT source, 1 FROM edges WHERE target = ?
  UNION
  SELECT e.source, i.depth + 1 FROM edges e
  JOIN impacted i ON e.target = i.id
  WHERE i.depth < ?
)
```

## Related Tools

- `get_callers` - CALLS edges only (narrower)
- `get_neighbors` - Distance-limited, bidirectional
- `find_path` - Specific path between nodes
