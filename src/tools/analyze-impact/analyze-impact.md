# analyzeImpact

Impact analysis: find all code affected by changes to a target symbol.

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
| `symbol` | string | Yes | Symbol name (e.g., `formatDate`, `User.save`) |
| `file` | string | No | Narrow scope to a file |
| `module` | string | No | Narrow scope to a module |
| `package` | string | No | Narrow scope to a package |
| `maxDepth` | number | No | Traversal depth 1-100 (default: 100) |

## Output Format

```
target: Node (Interface)
file: src/db/Types.ts
offset: 15
limit: 25
count: 42

src/tools/get-callers/format.ts (8 impacted):
  functions[8]:
    formatFunction [39-48] exp (node:Node & {...}) → string
    formatClass [53-62] exp (node:Node & {...}) → string
    ...
```

## Edge Types Traversed

Unlike `incomingCallsDeep` (CALLS only), impact analysis follows ALL incoming edges:

- **CALLS** - Functions that call the target
- **USES_TYPE** - Code using the type
- **EXTENDS** - Classes/interfaces extending target
- **IMPLEMENTS** - Classes implementing target
- **IMPORTS** - Files importing from target

## Examples

### Impact of a core type

```json
{ "symbol": "Node", "module": "db" }
```
→ Shows 42+ impacted nodes (high risk change)

### Impact of interface

```json
{ "symbol": "DbWriter" }
```
→ Shows all functions with `DbWriter` parameter

### Impact in specific file

```json
{ "symbol": "formatDate", "file": "src/utils.ts" }
```
→ Scoped to specific symbol location

### Direct dependents only

```json
{ "symbol": "helper", "maxDepth": 1 }
```
→ Immediate dependencies only

### Dead code check

```json
{ "symbol": "oldFunction", "file": "src/deprecated.ts" }
```
→ count: 0 means safe to delete

## Safe Refactoring Workflow

1. **Before changing a function:**
   ```json
   { "symbol": "formatDate" }
   ```
   Review all dependents

2. **Before changing an interface:**
   ```json
   { "symbol": "Node" }
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

- `incomingCallsDeep` - CALLS edges only (narrower)
- `getNeighborhood` - Distance-limited, bidirectional
- `findPaths` - Specific path between nodes
