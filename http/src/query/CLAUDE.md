# MCP Tools Module

This module contains the MCP tool implementations for ts-graph.

## Design Philosophy

**GPS for code.** All tools answer one question: "Find paths through the code graph with constraints."

| Constraint | Tool | Question |
|------------|------|----------|
| Start only | `dependenciesOf` | "What does this symbol depend on?" |
| End only | `dependentsOf` | "Who depends on this symbol?" |
| Both | `pathsBetween` | "How are A and B connected?" |

**Same question, same output.** All tools return the same format:

```
## Graph

entry --CALLS--> step02 --CALLS--> step03

## Nodes

step02:
  file: src/step02.ts
  offset: 3, limit: 3
  snippet:
    3: export function step02(): string {
    4:   return step03() + "-02";
    5: }
```

## Tool Structure

```
src/tools/<tool-name>/
  handler.ts   - MCP tool definition and execute function
  <tool>.ts    - Core function implementation
```

Shared formatting code lives in `src/tools/shared/`.

## MCP Tools Reference

### `dependenciesOf(file_path, symbol)`

Find all code that a symbol depends on (forward dependencies).

| Parameter | Required | Description |
|-----------|----------|-------------|
| `file_path` | ✓ | File containing the symbol (e.g., `"src/utils.ts"`) |
| `symbol` | ✓ | Symbol name (e.g., `"formatDate"`, `"User.save"`) |

**Returns:** Graph + Nodes sections showing all dependencies.
**Empty case:** `No dependencies found.`

### `dependentsOf(file_path, symbol)`

Find all code that depends on a symbol (reverse dependencies).

| Parameter | Required | Description |
|-----------|----------|-------------|
| `file_path` | ✓ | File containing the symbol |
| `symbol` | ✓ | Symbol name |

**Returns:** Graph + Nodes sections showing all dependents.
**Empty case:** `No dependents found.`

### `pathsBetween(from, to)`

Find how two symbols connect through the code graph.

| Parameter | Required | Description |
|-----------|----------|-------------|
| `from` | ✓ | Source: `{ file_path, symbol }` |
| `to` | ✓ | Target: `{ file_path, symbol }` |

**Bidirectional:** Finds the path regardless of which direction you specify. The arrows show actual direction.

**Returns:** Graph + Nodes sections showing the path.
**Error cases:**
- Same symbol: `Invalid query: source and target are the same symbol.`
- No connection: `No path found.`

## Symbol Lookup Errors

All tools provide rich error messages when a symbol is not found:

| Case | Message |
|------|---------|
| File not indexed | `File 'X' is not indexed.` + locations if symbol exists elsewhere |
| Symbol not in file | `Symbol 'X' not found at Y.` + available symbols in file (sorted by similarity) |
| Wrong file | `Symbol 'X' not found at Y.` + files where symbol exists (sorted by similarity) |

Implementation: `src/tools/shared/symbolNotFound.ts`

## Output Format

### Graph Section

- **Chain compaction**: Linear chains on one line (`A --CALLS--> B --CALLS--> C`)
- **Branch splitting**: Multiple outgoing edges start new lines
- **Edge types**: `--CALLS-->`, `--REFERENCES-->`, `--EXTENDS-->`, `--IMPLEMENTS-->`
- **Disambiguation**: When names collide, uses `#N` suffix (`formatDate#1`, `formatDate#2`)

### Nodes Section

- **Discovered nodes only**: Query inputs are excluded
- **Read tool compatible**: Includes `offset` and `limit`
- **Snippets**: Included when ≤15 nodes, omitted otherwise
- **Format**: `name: file, offset, limit, snippet`

## Edge Types Traversed

All tools traverse the same edges:

| Edge | Meaning |
|------|---------|
| CALLS | Direct function invocation |
| REFERENCES | Function passed as callback/stored |
| EXTENDS | Class inheritance |
| IMPLEMENTS | Interface implementation |
