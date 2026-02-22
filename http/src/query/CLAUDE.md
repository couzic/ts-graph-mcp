# Query Module

This module contains the graph query implementations for ts-graph.

## Core Principle

**ALWAYS RETURN A GRAPH.** This is a GraphRAG tool. The AI agent calling
`searchGraph()` expects to receive a graph. Every query pattern returns the same
output format: a graph with nodes and edges.

## Architecture

```
query/
├── search-graph/           # Unified search tool (MCP-exposed)
│   ├── searchGraph.ts      # Main entry point
│   └── SearchGraphTypes.ts # Input/output types
├── dependencies-of/        # Forward traversal (internal)
│   └── dependenciesOf.ts
├── dependents-of/          # Backward traversal (internal)
│   └── dependentsOf.ts
├── paths-between/          # Path finding (internal)
│   ├── pathsBetween.ts
│   └── query.ts
└── shared/                 # Formatting and utilities
```

## Design Philosophy

**One MCP tool: `searchGraph`.** All graph queries go through a unified
interface.

### Endpoint Types

| Parameter          | Purpose                                                 |
| ------------------ | ------------------------------------------------------- |
| `from: { symbol }` | Exact start node                                        |
| `from: { query }`  | Lexical + semantic search → multiple start nodes        |
| `to: { symbol }`   | Exact end node                                          |
| `to: { query }`    | Lexical + semantic search → multiple end nodes          |
| `topic`            | Standalone semantic search (not combinable with from/to) |

**`query` vs `symbol`:**

- `symbol` = exact match, single node
- `query` = lexical + semantic search, can return multiple nodes

**`topic` vs `query`:**

- `topic` = standalone semantic search (find code by concept)
- `query` = find start/end nodes for traversal

### Query Patterns

| Query Pattern            | Input                  | Question                                   |
| ------------------------ | ---------------------- | ------------------------------------------ |
| Forward traversal        | `{ from: { symbol } }` | "What does this depend on?"                |
| Backward traversal       | `{ to: { symbol } }`   | "Who depends on this?"                     |
| Path finding             | `{ from, to }`         | "How does A reach B?"                      |
| Loose search + traversal | `{ from: { query } }`  | "Find X and show dependencies"             |
| Semantic search          | `{ topic }`            | "Find code related to X"                   |

**Internal functions.** The core query functions are `dependenciesData`,
`dependentsData`, and `pathsBetweenData` — they return structured `QueryResult`
objects. `searchGraph` calls these directly. The convenience wrappers
`dependenciesOf`, `dependentsOf`, and `pathsBetween` format the result into a
string and are used by e2e tests and the HTTP API.

## searchGraph API

```typescript
// Returns structured QueryResult (not a formatted string)
const result: QueryResult = await searchGraph(db, {
  // At least one required:
  topic?: string,           // Standalone semantic search (not combinable with from/to)
  from?: GraphEndpoint,     // Start node(s)
  to?: GraphEndpoint,       // End node(s)
  max_nodes?: number        // Output limit (default: 50)
}, options)

// Format separately (done by HTTP server or MCP wrapper)
const text = formatMcpFromResult(result)
const diagrams = formatMermaidFromResult(result)

type GraphEndpoint = {
  query?: string,    // Lexical + semantic search (can return multiple nodes)
  symbol?: string,   // Exact symbol name (single node)
  file_path?: string // Include when known to avoid disambiguation
}
```

**Resolution priority:**

1. If `from` + `to` both provided → path finding
2. If only `from` provided → forward traversal (show dependencies)
3. If only `to` provided → backward traversal (show dependents)
4. If only `topic` provided → standalone semantic search

## Output Format

All queries return the same format:

```
## Graph

entry --CALLS--> step02 --CALLS--> step03

## Nodes

step02:
  type: Function
  file: src/step02.ts
  offset: 3, limit: 3
  snippet:
    3: export function step02(): string {
  > 4:   return step03() + "-02";
    5: }
```

### Graph Section

- **Chain compaction**: Linear chains on one line
  (`A --CALLS--> B --CALLS--> C`)
- **Branch splitting**: Multiple outgoing edges start new lines
- **Edge types**: `--CALLS-->`, `--REFERENCES-->`, `--EXTENDS-->`,
  `--IMPLEMENTS-->`

### Nodes Section

- **Discovered nodes only**: Query inputs are excluded
- **Read tool compatible**: Includes `offset` and `limit`
- **Snippets**: Included when ≤30 nodes, omitted above
- **Always shown**: Nodes section is included even after truncation

## Edge Types

| Edge         | Meaning                                     | Category |
| ------------ | ------------------------------------------- | -------- |
| CALLS        | Direct function invocation                  | Runtime  |
| REFERENCES   | Function passed as callback/stored          | Runtime  |
| INCLUDES     | JSX component usage                         | Runtime  |
| EXTENDS      | Class inheritance                           | Both     |
| IMPLEMENTS   | Interface implementation                    | Types    |
| TAKES        | Function/method parameter type              | Types    |
| RETURNS      | Function/method return type                 | Types    |
| HAS_TYPE     | Variable type annotation                    | Types    |
| HAS_PROPERTY | Class/interface/object property type        | Types    |
| DERIVES_FROM | Type alias composition (intersection/union) | Types    |
| ALIAS_FOR    | Direct type alias                           | Types    |
