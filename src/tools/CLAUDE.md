# MCP Tools Module

This module contains the MCP tool implementations for ts-graph-mcp.

## Design for the Consumer

**The consumer of these tools is an AI coding agent (Claude Code, etc.), not a human.**

This principle drives every API decision:

### Input: Conceptual, Not Positional

AI agents think in terms of **symbols** and **concepts**, not internal IDs or database keys.

```typescript
// BAD: Requires knowing internal ID format
incomingCallsDeep({ nodeId: "src/utils.ts:formatDate" })

// GOOD: Natural symbol reference
incomingCallsDeep({ symbol: "formatDate", module: "core" })
```

### Output: Directly Usable by Other Tools

Output should match the **input signature of downstream tools** with zero transformation.

```typescript
// BAD: Agent must compute limit = endLine - startLine + 1
{ file: "src/utils.ts", startLine: 15, endLine: 20 }

// GOOD: Directly usable by Read tool
{ file: "src/utils.ts", offset: 15, limit: 6 }
```

The Read tool takes `offset` and `limit`. Our output should provide exactly that.

### No Implementation Leakage

Internal graph concepts must not appear in the API:

| Internal Term | Public Term |
|---------------|-------------|
| `nodeId` | `symbol` + optional `file`/`module`/`package` |
| `nodeType` | `type` |
| `edgeType` | (hidden - describe relationships in plain terms) |
| `edgeCount` | (hidden - use "connections" or similar) |

### Zero Complexity > Trivial Complexity

Even "trivial" computation is unnecessary complexity:

- Off-by-one errors in line count calculation
- String parsing to extract file paths
- ID format construction

If the agent needs to transform data, the API is wrong.

### SymbolQuery: The Core Abstraction

All tools share a common input pattern via `SymbolQuery`:

```typescript
// src/tools/shared/SymbolQuery.ts
export const SymbolQuerySchema = z.object({
  symbol: z.string(),     // Required: "formatDate", "User.save"
  file: z.string().optional(),
  module: z.string().optional(),
  package: z.string().optional(),
});
```

**Composition patterns:**

```typescript
// Flat: incomingCallsDeep, outgoingCallsDeep, analyzeImpact
z.object({ ...SymbolQuerySchema.shape, maxDepth: z.number().optional() })

// Nested: findPaths (needs two symbols)
z.object({ from: SymbolQuerySchema, to: SymbolQuerySchema, ... })
```

This ensures consistent symbol resolution across all tools.

## Tool Structure

Each tool follows vertical slice architecture:

```
src/tools/<tool-name>/
  handler.ts   - MCP tool definition, parameter schema, execute function
  query.ts     - Direct SQL queries (recursive CTEs for graph traversal)
  format.ts    - Output formatting (machine-readable, not human-readable)
```

## MCP Tools Reference

The MCP server exposes 6 focused tools organized by relationship type. All tools use symbol-based queries with optional filters (`file`, `module`, `package`) for disambiguation.

### Call Graph Tools

#### `incomingCallsDeep`
Find all functions/methods that call the target (reverse call graph, transitive).

| Parameter | Required | Description |
|-----------|----------|-------------|
| `symbol` | ✓ | Target symbol name (e.g., `"formatDate"`, `"User.save"`) |
| `file` | | Narrow scope to a specific file |
| `module` | | Narrow scope to a specific module |
| `package` | | Narrow scope to a specific package |
| `maxDepth` | | Traversal depth (1-100, default: 100) |

**Output**: Includes `callCount` and `depth` (1 = direct, 2+ = transitive).

**Automatic Code Snippets**: When the number of callers is ≤15, the response includes source code snippets showing how the function is called at each call site. When there are many callers (>15), snippets are omitted to prevent context overload, and a note indicates this. The agent can still use the `offset`/`limit` coordinates with the Read tool to inspect specific callers.

#### `outgoingCallsDeep`
Find all functions/methods that the source calls (forward call graph, transitive).

| Parameter | Required | Description |
|-----------|----------|-------------|
| `symbol` | ✓ | Source symbol name |
| `file` | | Narrow scope to a specific file |
| `module` | | Narrow scope to a specific module |
| `package` | | Narrow scope to a specific package |
| `maxDepth` | | Traversal depth (1-100, default: 100) |

### Package Dependency Tools

#### `outgoingPackageDeps`
Find package-level dependencies (what packages does this package depend on).

| Parameter | Required | Description |
|-----------|----------|-------------|
| `package` | ✓ | Package name (e.g., `"backend/api"`) |
| `module` | | Narrow scope to a specific module |
| `maxDepth` | | Traversal depth (1 = direct only, default = all) |
| `outputTypes` | | Output formats: `["text"]`, `["mermaid"]`, or both |

#### `incomingPackageDeps`
Find reverse package dependencies (what packages depend on this package).

| Parameter | Required | Description |
|-----------|----------|-------------|
| `package` | ✓ | Package name (e.g., `"shared/types"`) |
| `module` | | Narrow scope to a specific module |
| `maxDepth` | | Traversal depth (1 = direct only, default = all) |
| `outputTypes` | | Output formats: `["text"]`, `["mermaid"]`, or both |

### Analysis Tools

#### `analyzeImpact`
Impact analysis - find all code affected by changes to a symbol.

| Parameter | Required | Description |
|-----------|----------|-------------|
| `symbol` | ✓ | Symbol to analyze |
| `file` | | Narrow scope to a specific file |
| `module` | | Narrow scope to a specific module |
| `package` | | Narrow scope to a specific package |
| `maxDepth` | | Traversal depth (default: 100) |

#### `findPaths`
Find paths between two symbols using BFS.

| Parameter | Required | Description |
|-----------|----------|-------------|
| `from` | ✓ | Source: `{ symbol, file?, module?, package? }` |
| `to` | ✓ | Target: `{ symbol, file?, module?, package? }` |
| `maxDepth` | | Maximum path length (1-100, default: 20) |
| `maxPaths` | | Maximum paths to return (1-10, default: 3) |

## See Also

- `ARCHITECTURE.md` - System architecture overview
