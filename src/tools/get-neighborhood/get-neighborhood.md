# getNeighborhood

Extract a neighborhood subgraph around a center symbol with optional Mermaid diagram.

## Purpose

Answer: "What's nearby this symbol?" Returns all symbols within a specified distance.

**Use cases:**
- Local context exploration
- Understanding immediate dependencies
- Visual subgraph extraction
- Extended impact analysis

## Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `symbol` | string | Yes | - | Symbol name (e.g., `formatDate`, `User.save`) |
| `file` | string | No | - | Narrow scope to a file |
| `module` | string | No | - | Narrow scope to a module |
| `package` | string | No | - | Narrow scope to a package |
| `distance` | number | No | 1 | Distance in edges (1-100) |
| `direction` | string | No | `both` | `outgoing`, `incoming`, or `both` |
| `outputTypes` | array | No | `["text"]` | Output formats: `["text"]`, `["mermaid"]`, or `["text", "mermaid"]` |

### Direction Semantics

- **`outgoing`** - What does this depend on? (follow source→target)
- **`incoming`** - What depends on this? (follow target→source)
- **`both`** - Full neighborhood

## Output Format

### Text Format (default)

```
center: UserService (Class)
file: src/models.ts
offset: 4
limit: 7
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
```

### Mermaid Format (when outputTypes includes "mermaid")

```
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
  "symbol": "UserService",
  "file": "src/models.ts",
  "distance": 1,
  "direction": "both"
}
```

### Extended dependencies (distance=2, outgoing)

```json
{
  "symbol": "formatDate",
  "distance": 2,
  "direction": "outgoing"
}
```

### Find what uses this (incoming)

```json
{
  "symbol": "User",
  "distance": 1,
  "direction": "incoming"
}
```

### With Mermaid diagram

```json
{
  "symbol": "UserService",
  "outputTypes": ["text", "mermaid"]
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
- **Optional Mermaid diagram** - Set `outputTypes: ["text", "mermaid"]` for visualization
- **Edge filtering** - Only edges within subgraph
- **Grouped output** - By file, then by type

## Comparison to Other Tools

| Tool | Difference |
|------|------------|
| `incomingCallsDeep` | Only CALLS, unlimited depth |
| `outgoingCallsDeep` | Only CALLS, unlimited depth |
| `analyzeImpact` | Semantic impact rules, no direction |
| `findPath` | Single path, not neighborhood |

## Related Tools

- `searchSymbols` - Find symbols by pattern
- `analyzeImpact` - Full impact analysis
- `incomingCallsDeep` / `outgoingCallsDeep` - Transitive call graphs
