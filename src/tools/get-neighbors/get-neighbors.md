# get_neighbors

Extract a neighborhood subgraph around a center node with Mermaid diagram.

## Purpose

Answer: "What's nearby this node?" Returns all nodes within a specified distance.

**Use cases:**
- Local context exploration
- Understanding immediate dependencies
- Visual subgraph extraction
- Extended impact analysis

## Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `nodeId` | string | Yes | - | Center node ID |
| `distance` | number | No | 1 | Distance in edges (1-100) |
| `direction` | string | No | `both` | `outgoing`, `incoming`, or `both` |

### Direction Semantics

- **`outgoing`** - What does this depend on? (follow source→target)
- **`incoming`** - What depends on this? (follow target→source)
- **`both`** - Full neighborhood

## Output Format

```
center: src/models.ts:UserService
centerType: Class
centerData:
  line: 4-10
  exported: true
distance: 1
direction: both
nodeCount: 3
edgeCount: 3

src/models.ts (3 nodes):
  methods[1]:
    addUser [7-9] (user:User) → void
  properties[1]:
    users [5-5] ro: User[]

edges[3]:
  models.ts --CONTAINS--> UserService
  UserService --CONTAINS--> addUser
  UserService --CONTAINS--> users

---mermaid---
graph LR
  n0["UserService"]
  n1["addUser()"]
  n2["users"]
  n0 -->|contains| n1
  n0 -->|contains| n2
```

## Examples

### Local context (distance=1)

```json
{
  "nodeId": "src/models.ts:UserService",
  "distance": 1,
  "direction": "both"
}
```

### Extended dependencies (distance=2, outgoing)

```json
{
  "nodeId": "src/utils.ts:formatDate",
  "distance": 2,
  "direction": "outgoing"
}
```

### Find what uses this (incoming)

```json
{
  "nodeId": "src/types.ts:User",
  "distance": 1,
  "direction": "incoming"
}
```

## Choosing Distance

| Distance | Use Case |
|----------|----------|
| 1 | Quick local context |
| 2 | Transitive relationships |
| 3+ | Broad impact (may be large) |

## Choosing Direction

| Goal | Direction |
|------|-----------|
| What does X depend on? | `outgoing` |
| What depends on X? | `incoming` |
| Full local context | `both` |

## Key Features

- **All edge types** (not just CALLS) - IMPORTS, USES_TYPE, CONTAINS, etc.
- **Mermaid diagram** for visualization
- **Edge filtering** - Only edges within subgraph
- **Grouped output** - By file, then by type

## Comparison to Other Tools

| Tool | Difference |
|------|------------|
| `get_callers` | Only CALLS, unlimited depth |
| `get_callees` | Only CALLS, unlimited depth |
| `get_impact` | Semantic impact rules, no direction |
| `find_path` | Single path, not neighborhood |

## Related Tools

- `search_nodes` - Find node IDs by pattern
- `get_file_symbols` - All symbols in a file
- `get_impact` - Full impact analysis
