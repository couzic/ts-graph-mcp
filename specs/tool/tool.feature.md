# searchGraph Tool

**Status:** ✅ Implemented

**ID:** `tool`

The system exposes a single MCP tool: `searchGraph`. It accepts structured input
and returns a subgraph showing how code symbols connect.

## Query patterns

### Forward traversal

> `{#tool::query.forward}`

Given `{ from: { symbol: "X" } }`, the tool returns all transitive dependencies
of X. The output contains X and every symbol reachable by following outgoing
edges from X.

### Backward traversal

> `{#tool::query.backward}`

Given `{ to: { symbol: "X" } }`, the tool returns all transitive dependents of
X. The output contains X and every symbol that transitively reaches X by
following outgoing edges.

### Path finding

> `{#tool::query.path}`

Given `{ from: { symbol: "A" }, to: { symbol: "B" } }`, the tool returns the
subgraph connecting A to B. If no forward path exists from A to B, the tool
attempts the reverse direction (B to A). If neither direction yields a path, the
tool returns a "No path found" message.

### Bidirectional IMPLEMENTS and EXTENDS traversal

> `{#tool::query.bidirectional-implements-extends}`

All traversals (forward, backward, path finding) treat `IMPLEMENTS` and
`EXTENDS` edges as bidirectional. When the BFS reaches a node through a forward
edge (e.g., `TAKES`), it can follow `IMPLEMENTS` or `EXTENDS` edges in reverse
to discover implementations or subclasses.

Given `functionF --TAKES--> InterfaceI` and `ClassC --IMPLEMENTS--> InterfaceI`:
- Forward from `functionF`: returns `InterfaceI` and `ClassC`
- Path from `functionF` to `ClassC`: returns
  `functionF --TAKES--> InterfaceI <--IMPLEMENTS-- ClassC`

### Edge priority for truncation

> `{#tool::query.edge-priority-truncation}`

When `max_nodes` truncation is needed, nodes discovered through high-priority
edges are kept before nodes discovered through low-priority edges.

| Priority | Edges | Direction |
|----------|-------|-----------|
| 1 (high) | CALLS, REFERENCES, INCLUDES | forward |
| 2 | TAKES, RETURNS, HAS_TYPE, HAS_PROPERTY, DERIVES_FROM, ALIAS_FOR | forward |
| 3 (low) | IMPLEMENTS, EXTENDS | reverse |

When the result fits within `max_nodes`, all discovered nodes are returned
regardless of priority.

### Topic search

> `{#tool::query.topic}`

Given `{ topic: "some concept" }`, the tool performs a hybrid search (BM25 +
vector) and returns results based on matching symbols. The number of results is
bounded by `max_nodes` (default 50).

### Topic with connections

> `{#tool::query.topic-connected}`

When topic search finds symbols that have graph edges connecting them, the tool
returns a graph (Graph + Nodes sections) showing those connections. Non-matching
symbols that lie on paths between matches are excluded unless they are bridge
nodes `[@tool::query.topic-bridge]`.

### Topic without connections

> `{#tool::query.topic-disconnected}`

When topic search finds symbols that have no graph edges connecting them, the
tool returns a flat list of matching symbols with their types, files, and search
scores. The output contains "No connections found between symbols."

### Topic bridge nodes

> `{#tool::query.topic-bridge}`

When topic search finds symbols A and B that are not directly connected but are
connected through intermediate nodes, those intermediate "bridge" nodes are
included in the graph output. Specifically, the tool runs multi-source BFS from
all matched symbols and includes paths through nodes reachable from 2+ seeds.

### Loose forward query

> `{#tool::query.loose-forward}`

Given `{ from: { query: "some concept" } }`, the tool resolves the query via
hybrid search to one or more matching symbols, then performs forward traversal
from each. Results are merged and deduplicated.

### Loose backward query

> `{#tool::query.loose-backward}`

Given `{ to: { query: "some concept" } }`, the tool resolves the query via
hybrid search to one or more matching symbols, then performs backward traversal
to each. Results are merged and deduplicated.

### Loose path query

> `{#tool::query.loose-path}`

Given `{ from: { query: "A concept" }, to: { query: "B concept" } }`, the tool
resolves both queries via hybrid search, then finds paths between all
combinations of from x to endpoints. Results are merged and deduplicated. If no
paths exist between any combination, the tool returns "No paths found between
matching symbols."

### Loose query no results

> `{#tool::query.loose-no-results}`

When a `query`-based endpoint resolves to zero symbols, the tool returns a
message: "No symbols found matching query: ..." with a suggestion to try a more
specific query or use topic search.

## Symbol resolution

### Exact symbol match

> `{#tool::resolve.exact}`

When `from` or `to` uses `{ symbol: "X" }`, the tool looks up X by exact name
in the database. If a single node matches, it is used directly.

### Symbol with file_path

> `{#tool::resolve.exact-with-file}`

When `{ symbol: "X", file_path: "src/foo.ts" }` is provided, the tool first
searches within the specified file. If an exact match is found and the symbol
path in the node ID ends with `:X`, no resolution message is shown (clean
output). If the match is a method (e.g., `Class.X`), a resolution message is
shown: "Found 'X' as Class.X in src/foo.ts".

### Single match auto-resolve

> `{#tool::resolve.auto-resolve}`

When `{ symbol: "X" }` is provided without `file_path` and exactly one node
matches across the entire codebase, the tool auto-resolves and shows a message:
"Found 'X' in src/foo.ts".

### Multi-match disambiguation

> `{#tool::resolve.disambiguation}`

When `{ symbol: "X" }` matches multiple nodes across different files, the tool
returns an error listing all matches with their file paths:
"Multiple symbols named 'X' found:" followed by each match in the form
"- TypeAndSymbol (file_path)".

### Method name fallback

> `{#tool::resolve.method-fallback}`

When a symbol resolves to a Class node that has no direct edges, and that class
has exactly one method with dependencies, the tool automatically falls back to
that method. A resolution message is shown: "Resolved 'ClassName' to
ClassName.methodName". This applies to both forward and backward traversal.

### Class multi-method disambiguation

> `{#tool::resolve.class-disambiguation}`

When a symbol resolves to a Class node that has no direct edges and the class has
multiple methods, the tool returns a disambiguation message listing available
methods: "Class 'X' has no direct dependencies. Available methods:" followed by
each method. Methods without dependencies are annotated "(no dependencies)".

### Symbol not found

> `{#tool::resolve.not-found}`

When a symbol cannot be found:

- If `file_path` was provided and the file is not indexed: "File 'X' is not
  indexed."
- If `file_path` was provided and the file is indexed but the symbol is missing:
  "Symbol 'X' not found at file_path" followed by up to 5 available symbols in
  that file sorted by Levenshtein distance.
- If the symbol exists in other files, an additional "Found 'X' in:" section
  lists those files.
- If no `file_path` was provided: "Symbol 'X' not found."

## Output

### MCP format structure

> `{#tool::output.mcp-structure}`

The MCP output contains two sections:

1. **Graph section** (`## Graph`): Compact text visualization of edges using
   symbol display names and edge types (e.g., `fnA --CALLS--> fnB`).
2. **Nodes section** (`## Nodes`): Metadata for each discovered node including
   type, file, offset, limit, and optionally a code snippet.

When a resolution message exists, it is prepended before the Graph section.

### Chain compaction

> `{#tool::output.chain-compaction}`

In the Graph section, linear chains (A calls B, B calls C, nothing else) are
rendered on a single line: `A --CALLS--> B --CALLS--> C`.

### Branch splitting

> `{#tool::output.branch-splitting}`

In the Graph section, when a node has multiple outgoing edges, the first edge
continues the current chain. Each additional edge starts a new line from the
branch point: e.g., `A --CALLS--> B` on one line and `A --CALLS--> C` on the
next.

### Nodes section content

> `{#tool::output.nodes-content}`

Each node entry in the Nodes section contains:

- Display name (symbol name, disambiguated with `#N` suffix when names collide)
- `type`: the node type (Function, Class, Method, Interface, TypeAlias, Variable,
  SyntheticType)
- `file`: the source file path
- `offset` and `limit`: start line and line count, compatible with the Read tool
- `snippet` (when included): source code lines with call site lines prefixed by
  `> ` and other lines indented with 4 spaces. Non-adjacent lines are separated
  by `... N lines omitted ...`.

### Mermaid format structure

> `{#tool::output.mermaid-structure}`

When the HTTP API is called with `format: "mermaid"`, the result is an array of
Mermaid flowchart strings (one per connected component). Each string starts with
`graph LR` or `graph TD` and contains node declarations and edge declarations
with labels.

### Mermaid connected components

> `{#tool::output.mermaid-components}`

Disconnected subgraphs in the result are split into separate Mermaid diagrams.
Each diagram is a self-contained flowchart with its own `graph` header.

### Mermaid subgraphs

> `{#tool::output.mermaid-subgraphs}`

In Mermaid output, nodes from the same file (or same package when multiple
packages are present) are grouped into a `subgraph` block only when the group
contains 2+ symbols globally. Groups with a single symbol are rendered without a
subgraph wrapper.

### Mermaid direction

> `{#tool::output.mermaid-direction}`

Mermaid diagrams default to `LR` (left-to-right) when no subgraphs are present,
and `TD` (top-down) when subgraphs are present. The `direction` parameter
overrides this default.

### Snippet inclusion threshold

> `{#tool::output.snippet-threshold}`

Code snippets in the Nodes section are included when the total number of unique
nodes in the graph is 30 or fewer. Above 30 nodes, the Nodes section still
appears but snippets are omitted (only metadata: type, file, offset, limit).

### Max nodes truncation

> `{#tool::output.truncation}`

When the total number of unique nodes in the graph exceeds `max_nodes`, the graph
is truncated to the first `max_nodes` nodes in BFS traversal order. Only edges
between kept nodes are included. The Nodes section is generated for the kept
nodes. A message is appended: "(N nodes displayed. Use max_nodes param for full
output.)"

### Max nodes default

> `{#tool::output.max-nodes-default}`

The default value of `max_nodes` is 50.

## Input validation

### At least one parameter required

> `{#tool::validation.required-param}`

If none of `topic`, `from`, or `to` is provided, the tool returns an error:
"At least one of 'topic', 'from', or 'to' is required."

### Topic is standalone

> `{#tool::validation.topic-standalone}`

The `topic` parameter cannot be combined with `from` or `to`. The input type
enforces this at the type level: `topic` belongs to one variant of a union type,
while `from`/`to` belong to a separate variant.

### Empty topic treated as absent

> `{#tool::validation.empty-topic}`

An empty string for `topic` is treated as if `topic` was not provided. The tool
falls through to the `from`/`to` logic.

### Search index required for semantic

> `{#tool::validation.search-index-required}`

When `topic` is provided or `from`/`to` uses `query` (not `symbol`), the search
index must be available. If it is not, the tool returns: "Semantic search
requires embeddings. Run the server to enable semantic search."
