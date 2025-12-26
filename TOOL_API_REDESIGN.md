# Tool API Redesign

> Specification for the simplified ts-graph-mcp API.

## Philosophy

**GPS for code.** All tools answer one question: "Find paths through the code graph with constraints."

| Constraint | Tool | Question |
|------------|------|----------|
| Start only | `dependenciesOf` | "What does this symbol depend on?" |
| End only | `dependentsOf` | "Who depends on this symbol?" |
| Both (bidirectional) | `pathsBetween` | "How are A and B connected?" |

**Same question, same output.** Since all tools conceptually return paths through the graph (just with different constraints), the output format is identical across all tools. Whether `pathsBetween` produces linear chains or `dependenciesOf` produces branching trees is accidental (a side effect of constraints), not conceptual (a fundamental difference in output).

## API Specification

### dependentsOf

Find all code that depends on a symbol (reverse dependencies).

```typescript
dependentsOf(file_path: string, symbol: string)
```

**Example:**
```
dependentsOf("src/utils.ts", "formatDate")
```

### dependenciesOf

Find all code that a symbol depends on (forward dependencies).

```typescript
dependenciesOf(file_path: string, symbol: string)
```

**Example:**
```
dependenciesOf("src/orderService.ts", "processOrder")
```

### pathsBetween

Find how two symbols connect through the code graph.

```typescript
pathsBetween(
  from: { file_path: string, symbol: string },
  to: { file_path: string, symbol: string }
)
```

**Bidirectional search:** Finds the path regardless of which direction you specify. The arrows in the output (`--CALLS-->`) show the actual direction. This is intentional — you often don't know which way the dependency flows when asking the question.

**Error cases:**
- Same symbol for source and target → `Invalid query: source and target are the same symbol.`
- No connection exists → `No path found.`

**Example:**
```
pathsBetween(
  { file_path: "src/api/handler.ts", symbol: "handleRequest" },
  { file_path: "src/db/queries.ts", symbol: "executeQuery" }
)
```

## Design Principles

### 1. Follow Read tool pattern

```typescript
// Read tool
Read(file_path, offset?, limit?)

// Our tools
dependentsOf(file_path, symbol)
```

- `file_path` comes first
- `file_path` is required (no ambiguity)

### 2. No optional tuning params

The tool knows best:
- **Depth limits**: Internal safeguard, not caller's concern
- **Path counts**: Return sensible number (e.g., 3 shortest)
- **Edge types**: Traverse all (CALLS, REFERENCES, EXTENDS, IMPLEMENTS)

### 3. Radical simplicity

| Old API | New API |
|---------|---------|
| 6 tools | 3 tools |
| Many optional params | 2 required params each |
| `maxDepth`, `maxPaths`, `module`, `package` | None |

## Output Format

All tools return two sections:

```
## Graph

handleRequest --CALLS--> formatDate --CALLS--> toISOString
processOrder --CALLS--> formatDate

## Nodes

formatDate:
  file: src/utils.ts
  offset: 15, limit: 3
  snippet:
    15: function formatDate(timestamp: number): string {
    16:   return new Date(timestamp).toISOString();
    17: }

handleRequest:
  file: src/api/handler.ts
  offset: 10, limit: 25
  snippet:
    ... omitted 7 lines ...
    17:   const timestamp = req.body.timestamp;
    18:   const date = formatDate(timestamp);
    19:   if (date) {
    ... omitted 15 lines ...

processOrder:
  file: src/orders/service.ts
  offset: 42, limit: 30
  snippet:
    42: export function processOrder(order: Order): Result {
    43:   const validated = validate(order);
    ... omitted 25 lines ...
    70:   return result;
    71: }

toISOString:
  file: node_modules/date-fns/index.ts
  offset: 120, limit: 3
```

### Graph Section

- **Chain compaction**: Linear chains rendered on a single line (e.g., `A --CALLS--> B --CALLS--> C`)
- **Branch splitting**: When a node has multiple outgoing edges, each branch starts a new line
- Edge types visible: `--CALLS-->`, `--REFERENCES-->`, `--EXTENDS-->`, `--IMPLEMENTS-->`
- **Symbol names**: Use short names when unique

**Example (linear chain):**
```
entry --CALLS--> step02 --CALLS--> step03 --CALLS--> step04 --CALLS--> step05
```

**Example (branching):**
```
A --CALLS--> B --CALLS--> C
B --CALLS--> D
```
Branch point B appears at the start of a new line, making the split obvious.

### Symbol Disambiguation

When multiple symbols share the same name, use `#N` IDs:

```
## Graph

handleRequest --CALLS--> formatDate#1 --CALLS--> toISOString
formatDate#2 --CALLS--> parseDate

## Nodes

formatDate#1:
  file: src/api/utils.ts
  offset: 15, limit: 1
  snippet:
    15: export const formatDate = (d: Date) => d.toISOString();

formatDate#2:
  file: src/legacy/utils.ts
  offset: 42, limit: 3
  snippet:
    42: function formatDate(d: Date): string {
    43:   return parseDate(d).format("YYYY-MM-DD");
    44: }
```

- Unique symbols: just the name (`formatDate`)
- Ambiguous symbols: name + ID (`formatDate#1`, `formatDate#2`)
- Full path in Nodes section resolves the ID

### Nodes Section

- **Discovered nodes only**: Query inputs are excluded — the caller already knows about them
  - `dependenciesOf(file, symbol)` → excludes `symbol`
  - `dependentsOf(file, symbol)` → excludes `symbol`
  - `pathsBetween(from, to)` → excludes both `from` and `to`
- Each node listed once (no duplication)
- Contains: file, offset, limit (for Read tool integration)
- Lookup table for Graph section symbols

### Code Snippets

Snippets show relevant code context directly in the output, eliminating the need for follow-up Read calls.

**When snippets are included:**
- Result count ≤ 15 nodes → snippets included automatically
- Result count > 15 nodes → snippets omitted (note shown: "snippets omitted due to size")

**Snippet format:**
- Line numbers prefix each line (e.g., `17:   const x = ...`)
- Complete function → no omission markers
- Partial view → always show `... omitted N lines ...` (count aligns with Read tool's `limit` param)

**Snippet selection strategy:**
- Small functions (≤10 lines) → show entire function body
- Larger functions → show context around relevant code with omission markers
- External/library symbols → no snippet (just offset/limit for Read tool)

## Migration

| Old Tool | New Tool |
|----------|----------|
| `incomingCallsDeep` | `dependentsOf` |
| `outgoingCallsDeep` | `dependenciesOf` |
| `findPaths` | `pathsBetween` |
| `analyzeImpact` | Removed |
| `incomingPackageDeps` | Removed |
| `outgoingPackageDeps` | Removed |

## Edge Types Traversed

All tools traverse the same edges:

| Edge | Meaning |
|------|---------|
| CALLS | Direct function invocation |
| REFERENCES | Function passed as callback/stored |
| EXTENDS | Class inheritance |
| IMPLEMENTS | Interface implementation |

