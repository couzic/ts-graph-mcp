# Architecture

**ts-graph-mcp** is an MCP server that extracts TypeScript code structure into a queryable graph database.

## Overview

The graph captures:
- **Nodes**: Code symbols (functions, classes, methods, interfaces, types, variables, files, properties)
- **Edges**: Relationships between symbols (calls, imports, type usage, inheritance, etc.)

The MCP server exposes tools for AI agents to traverse call graphs, find dependencies, and trace paths between symbols.

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        MCP Server Layer                         │
│              (startMcpServer.ts dispatches to tool handlers)    │
├─────────────────────────────────────────────────────────────────┤
│                         MCP Tools                               │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐             │
│  │dependenciesOf│ │ dependentsOf │ │ pathsBetween │             │
│  │  handler.ts  │ │  handler.ts  │ │  handler.ts  │             │
│  │  <tool>.ts   │ │  <tool>.ts   │ │  <tool>.ts   │             │
│  └──────┬───────┘ └──────┬───────┘ └──────┬───────┘             │
│         │ direct SQL     │                │                     │
└─────────┼────────────────┼────────────────┼─────────────────────┘
          ↓                ↓                ↓
┌─────────────────────────────────────────────────────────────────┐
│                    SQLite Database (graph.db)                   │
│                    - nodes table                                │
│                    - edges table                                │
└────────────────────────────────┬────────────────────────────────┘
                                 ↑ writes
┌────────────────────────────────┴────────────────────────────────┐
│                    Ingestion Pipeline                           │
│          (Extractor → NodeExtractors → EdgeExtractors)          │
│                            ↑                                    │
│                   TypeScript Source (ts-morph)                  │
└─────────────────────────────────────────────────────────────────┘
```

Each tool has its own folder (`src/tools/<tool>/`) with shared formatting code in `src/tools/shared/`.

## Server Architecture

The server uses a **wrapper + HTTP server** pattern to share resources across multiple Claude Code sessions:

```
Claude Code Session 1, 2, 3...
        │ spawns (stdio)
        ↓
┌───────────────────────────────────┐
│  Stdio MCP Server                 │
│  (wrapperClient.ts)               │
│  - Checks for running HTTP server │
│  - Spawns server if not running   │
│  - Calls HTTP API for queries     │
└───────────────────────────────────┘
        │ HTTP POST /api/*
        ↓
┌───────────────────────────────────┐
│  HTTP API Server (httpServer.ts)  │
│  ONE instance per project:        │
│  - REST API (Express)             │
│  - File watcher (chokidar)        │
│  - SQLite database (one writer)   │
└───────────────────────────────────┘
```

**Why this design?**

Without the HTTP server, each Claude session would spawn its own MCP process with its own file watcher and database writer. With N sessions = N watchers = wasted resources and potential conflicts.

The wrapper is transparent — users configure MCP the same way (`npx ts-graph-mcp`), but all sessions share one server.

**Key files:**
- `src/mcp/main.ts` — Entry point, dispatches to stdio MCP or API server mode
- `src/mcp/wrapperClient.ts` — Stdio MCP server, auto-spawns API server
- `src/mcp/httpServer.ts` — HTTP API server (simple REST, not MCP)
- `src/mcp/serverMetadata.ts` — Server discovery via `server.json`
- `src/mcp/serverCore.ts` — Shared initialization (DB, indexing, watcher)

The stdio MCP server auto-spawns an HTTP API server if not already running, then makes HTTP calls for queries.

**Async startup:** The HTTP server starts immediately, before indexing completes. This prevents MCP connection timeouts on large projects. Tools return "Database is still indexing" until ready.

**Race condition prevention:** Multiple Claude sessions may start simultaneously. To prevent duplicate servers:

1. **PID-based detection** — `getRunningServer()` checks if the process in `server.json` is still alive via `process.kill(pid, 0)`. If alive, trusts it even if health check times out (server may be busy indexing).

2. **Spawn lock** — Before spawning, wrapper acquires exclusive lock (`spawn.lock` with `O_EXCL`). If lock held by another process, waits for that process to finish spawning. Lock includes PID for stale lock detection.

## Data Model

See `src/db/Types.ts` for node and edge type definitions.

**Node ID format**: `{filePath}:{symbolPath}` — e.g., `src/utils.ts:formatDate`, `src/models/User.ts:User.save`

### Edge Types

| Edge | Description |
|------|-------------|
| `CALLS` | Direct function/method invocation |
| `INCLUDES` | JSX component usage (`<Component />`) |
| `IMPORTS` | File imports another file |
| `CONTAINS` | File contains top-level symbol |
| `EXTENDS` | Class/interface inheritance |
| `IMPLEMENTS` | Class implements interface |
| `USES_TYPE` | Type reference in signature |
| `REFERENCES` | Function passed as callback or stored |

### Transparent Re-exports

**Re-exports are completely invisible in the graph.** No nodes, no edges, nothing.

When file X imports from a barrel file and calls a function:
```typescript
// X.ts
import { formatValue } from './index';  // barrel re-exports from helper.ts
formatValue();
```

The graph shows: `X.ts --CALLS--> src/utils/helper.ts:formatValue`

**NOT:** `X.ts --CALLS--> src/index.ts:...` (barrel file is invisible)

This is achieved at **indexing time**:
- `buildImportMap.ts` follows re-export chains using `followAliasChain()`
- Edges point directly to actual definitions
- Barrel files with only re-exports have no symbol nodes (just File node)

No query-time resolution needed. The graph only contains actual code definitions.

## Data Flow

### Indexing Pipeline

Streaming architecture — processes one file at a time:

1. **Extract Nodes** from AST → write to DB
2. **Extract Edges** using import map for cross-file resolution → write to DB

Memory efficient: O(1) per file, scales to any codebase size.

### Cross-File Resolution

Edge extractors use `buildImportMap` to resolve cross-file references:
- ts-morph resolves import paths (handles tsconfig `paths` aliases like `@shared/*`)
- Workspace map resolves cross-package imports in monorepos (see below)
- Import map constructs target IDs: `{targetPath}:{symbolName}`
- No need to validate target exists — queries use JOINs to filter dangling edges

### Workspace Resolution

For monorepos with multiple packages, ts-graph-mcp builds a **workspace map** at project creation time that maps package names directly to source entry files:

```
"@libs/toolkit" → "/path/to/libs/toolkit/src/index.ts"
"@app/shared"   → "/path/to/app/shared/src/index.ts"
```

**Why not use package manager resolution (PnP, node_modules)?**

Package managers resolve to compiled output (`dist/index.js`). This tool analyzes **source code** — it should never require `dist/` folders to exist.

**How it works** (`buildWorkspaceMap.ts`):
1. Parse root `package.json` workspaces field (supports globs like `libs/*`)
2. For each package, read its `package.json` to get the npm package name
3. Infer source entry from `main` + tsconfig `outDir`/`rootDir` mapping
4. Build map: `packageName → absoluteSourcePath`

**Resolution order** in `createProject.ts`:
1. Check workspace map for exact package name match
2. Fall back to standard TypeScript resolution (relative imports, external packages)

### No Foreign Key Constraints

The schema omits FK constraints intentionally:
1. Queries JOIN with nodes table, automatically filtering dangling edges
2. Backend-agnostic (graph databases don't use FK constraints)
3. Enables parallel indexing of packages

## MCP Tools

All tools follow the Read tool pattern: `file_path` first (required), then `symbol`. The tool decides internal limits (depth, result count) for optimal performance.

| Constraint | Tool | Query |
|------------|------|-------|
| Start only | `dependenciesOf(file_path, symbol)` | "What does this depend on?" |
| End only | `dependentsOf(file_path, symbol)` | "Who depends on this?" |
| Both | `pathsBetween(from, to)` | "How does A reach B?" |

See [`src/tools/CLAUDE.md`](src/tools/CLAUDE.md) for parameter details.

### Design Philosophy

**Lean definitions.** Tool definitions appear in every conversation (fixed token cost), so keep them as concise as possible yet providing all the crucial information and making sure the AI agent will call them when it's the efficient solution.

## LSP Overlap

Claude Code has a built-in LSP tool. Use each for its strengths:

| LSP | ts-graph-mcp |
|-----|--------------|
| Real-time, no indexing lag | Pre-indexed, instant complex queries |
| Point-to-point (definition, direct refs) | Transitive (callers of callers) |
| Single function context | Path finding (A → B) |

## File Watching

The server automatically reindexes files on save:

1. **Startup sync** — Compares manifest (mtime/size) with filesystem, reindexes stale/new files
2. **Runtime watcher** — Chokidar watches for changes, debounces rapid saves (300ms default)
3. **tsconfig validation** — Only files in tsconfig compilation are indexed (not just any `.ts` file)

**Key files:**
- `src/ingestion/watchProject.ts` — Chokidar watcher with debouncing
- `src/ingestion/syncOnStartup.ts` — Manifest-based startup sync
- `src/ingestion/manifest.ts` — Tracks indexed files (mtime/size)
- `src/ingestion/indexFile.ts` — Shared extraction function

Watch options can be read from `tsconfig.json` `watchOptions` as defaults. See README for configuration reference.

## Limitations

1. **SQLite only** — Query logic uses direct SQL. DbWriter interface exists for writes only.
2. **No config watching** — Changes to tsconfig.json or package.json workspaces require server restart.
3. **Base package imports only** — Workspace resolution handles `@libs/toolkit` but not subpath imports like `@libs/toolkit/helpers` (would require `exports` field parsing).
