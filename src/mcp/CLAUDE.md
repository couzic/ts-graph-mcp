# MCP Module

## Purpose

Exposes the TypeScript code graph as an MCP (Model Context Protocol) server that provides 3 tools for AI coding agents to query and explore code structure. This is the primary interface for the ts-graph-mcp project.

## Architecture: Vertical Slices

Each tool is implemented as a self-contained vertical slice in `src/tools/<tool-name>/`:

```
src/tools/
├── dependencies-of/       # What does this depend on?
├── dependents-of/         # Who depends on this?
├── paths-between/         # How does A reach B?
└── shared/                # formatGraph.ts, formatNodes.ts, extractSnippet.ts
```

**Each slice contains:**
- `handler.ts` - MCP tool definition and execution entry point
- `<tool>.ts` - Core function (e.g., `dependenciesOf.ts`)

**Shared utilities:**
- `formatGraph.ts` - Chain-compacted graph rendering
- `formatNodes.ts` - Nodes section with code snippets
- `extractSnippet.ts` - Code snippet extraction

## Key Exports

### `startMcpServer(db: Database.Database, projectRoot: string): Promise<void>`
**File:** `startMcpServer.ts`

Initializes and starts the MCP server on stdio transport with 3 registered tools.

### `main(): Promise<void>`
**File:** `main.ts`

CLI entry point that orchestrates database initialization and server startup.

## MCP Tools

All tools follow the same output format:

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

### `dependenciesOf(file_path, symbol)`
Find all code that a symbol depends on (forward dependencies).

### `dependentsOf(file_path, symbol)`
Find all code that depends on a symbol (reverse dependencies).

### `pathsBetween(from, to)`
Find how two symbols connect. Bidirectional: finds path regardless of query direction.

## Important Notes

- **Logging:** All logs go to stderr to avoid interfering with stdio transport
- **No file watching:** Server doesn't auto-refresh on code changes
- **Tool execution:** All tools are read-only
