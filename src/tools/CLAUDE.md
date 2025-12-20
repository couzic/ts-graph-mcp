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
// Flat: incomingCallsDeep, analyzeImpact, getNeighborhood
z.object({ ...SymbolQuerySchema.shape, maxDepth: z.number().optional() })

// Nested: findPath (needs two symbols)
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

## See Also

- `ARCHITECTURE.md` - System architecture overview
