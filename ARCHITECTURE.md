# Architecture

ts-graph is an MCP server that extracts TypeScript code structure into a queryable graph database.

## Overview

Single package with two modes:

| Command | Mode | Purpose |
|---------|------|---------|
| `npx ts-graph-mcp` | HTTP server | Indexing + HTTP API + Web UI |
| `npx ts-graph-mcp --mcp` | MCP wrapper | Stdio MCP server for Claude Code |

The MCP wrapper expects the HTTP server to be running separately.

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    Claude Code (MCP client)                     │
└───────────────────────────┬─────────────────────────────────────┘
                            │ spawns (stdio)
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│                  MCP Wrapper (mcp/src/wrapper.ts)               │
│              - Stdio MCP server                                 │
│              - Calls HTTP API for queries                       │
└───────────────────────────┬─────────────────────────────────────┘
                            │ HTTP POST /api/*
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│              HTTP Server (http/src/server.ts)                   │
│              - REST API (Express)                               │
│              - File watcher (chokidar)                          │
│              - SQLite database (one writer)                     │
│              - Serves Web UI                                    │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│                    SQLite Database (graph.db)                   │
│                    - nodes table                                │
│                    - edges table                                │
└────────────────────────────────────────────────────────────────┬┘
                                                                 ↑
┌────────────────────────────────────────────────────────────────┴┐
│                    Ingestion Pipeline                           │
│          (Extractor → NodeExtractors → EdgeExtractors)          │
│                            ↑                                    │
│                   TypeScript Source (ts-morph)                  │
└─────────────────────────────────────────────────────────────────┘
```

## Project Structure

Monorepo with 4 internal workspace packages:

```
ts-graph-mcp/
├── http/                        # @ts-graph/http (internal)
│   └── src/
│       ├── server.ts            # HTTP server entry point
│       ├── config/              # Configuration loading
│       ├── db/                  # Database abstraction
│       ├── ingestion/           # AST extraction pipeline
│       └── query/               # Tool implementations
├── mcp/                         # @ts-graph/mcp (internal)
│   └── src/
│       └── wrapper.ts           # MCP stdio wrapper
├── shared/                      # @ts-graph/shared (internal)
│   └── src/
│       └── index.ts             # Shared types
├── ui/                          # @ts-graph/ui (internal)
│   └── src/                     # React SPA (Vite build)
├── main.ts                      # Entry point (--mcp flag dispatch)
└── package.json                 # Root: ts-graph-mcp (published)
```

- `http/` and `mcp/` are parallel — both are "servers", named by protocol
- `shared/` contains types/interfaces used by all packages
- `ui/` is a React SPA with its own Vite build
- Only root `ts-graph-mcp` is published; internal packages use `@ts-graph/*` imports

## Server Discovery

The MCP wrapper finds the HTTP server using this priority:

1. **Config file:** `ts-graph-mcp.config.json` → `server.port` (required)
2. **Environment variable:** `TS_GRAPH_URL` (optional override)

The port must be configured in `ts-graph-mcp.config.json`. There is no default port.

## HTTP API

### Health Check

```
GET /health

Response:
{ "status": "ok", "ready": true, "indexed_files": 142 }
```

### Symbol Search (for autocomplete)

```
GET /api/symbols?q=format

Response:
[
  { "file_path": "src/utils.ts", "symbol": "formatDate", "type": "Function" },
  { "file_path": "src/utils.ts", "symbol": "formatNumber", "type": "Function" }
]
```

### Graph Queries

All graph endpoints support the `output` query parameter:
- `mcp` — Compact text format optimized for LLMs
- `mermaid` — Mermaid diagram syntax
- `md` — Markdown format

```
GET /api/graph/dependencies?file=src/api.ts&symbol=handleRequest&output=mcp
GET /api/graph/dependents?file=src/api.ts&symbol=handleRequest&output=mcp
GET /api/graph/paths?from_file=src/api.ts&from_symbol=handleRequest&to_file=src/db.ts&to_symbol=saveData&output=mcp
```

## Data Model

See `http/src/db/Types.ts` for node and edge type definitions.

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
- Workspace map resolves cross-package imports in monorepos
- Import map constructs target IDs: `{targetPath}:{symbolName}`
- No need to validate target exists — queries use JOINs to filter dangling edges

### Workspace Resolution

For monorepos with multiple packages, ts-graph builds a **workspace map** at project creation time that maps package names directly to source entry files:

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

See [`http/src/query/CLAUDE.md`](http/src/query/CLAUDE.md) for implementation details.

### Design Philosophy

**Lean definitions.** Tool definitions appear in every conversation (fixed token cost), so keep them as concise as possible yet providing all the crucial information and making sure the AI agent will call them when it's the efficient solution.

## LSP Overlap

Claude Code has a built-in LSP tool. Use each for its strengths:

| LSP | ts-graph |
|-----|----------|
| Real-time, no indexing lag | Pre-indexed, instant complex queries |
| Point-to-point (definition, direct refs) | Transitive (callers of callers) |
| Single function context | Path finding (A → B) |

## File Watching

The server automatically reindexes files on save:

1. **Startup sync** — Compares manifest (mtime/size) with filesystem, reindexes stale/new files
2. **Runtime watcher** — Chokidar watches for changes, debounces rapid saves (300ms default)
3. **tsconfig validation** — Only files in tsconfig compilation are indexed (not just any `.ts` file)

**Key files:**
- `http/src/ingestion/watchProject.ts` — Chokidar watcher with debouncing
- `http/src/ingestion/syncOnStartup.ts` — Manifest-based startup sync
- `http/src/ingestion/manifest.ts` — Tracks indexed files (mtime/size)
- `http/src/ingestion/indexFile.ts` — Shared extraction function

Watch options can be read from `tsconfig.json` `watchOptions` as defaults. See README for configuration reference.

## Web UI

Single-page application served at the root URL.

### Layout

```
┌─────────────────────────────────────────────────────────────────┐
│  [START node ▼] [×]      [END node ▼] [×]                       │
├─────────────────────────────────────────────────────────────────┤
│  [ MCP ] [ Mermaid ] [ Markdown ]                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  (output display area)                                          │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Behavior

| Selection | Query | Display |
|-----------|-------|---------|
| 0 nodes | — | Empty / instructions |
| 1 node (START only) | dependentsOf | Who depends on this? |
| 2 nodes (START + END) | pathsBetween | How does START reach END? |

Both select inputs use fuzzy search against `/api/symbols?q=...` endpoint.

## Limitations

1. **SQLite only** — Query logic uses direct SQL. DbWriter interface exists for writes only.
2. **No config watching** — Changes to tsconfig.json or package.json workspaces require server restart.
3. **Base package imports only** — Workspace resolution handles `@libs/toolkit` but not subpath imports like `@libs/toolkit/helpers` (would require `exports` field parsing).
