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

## Data Model

See `src/db/Types.ts` for node and edge type definitions.

**Node ID format**: `{filePath}:{symbolPath}` — e.g., `src/utils.ts:formatDate`, `src/models/User.ts:User.save`

## Data Flow

### Indexing Pipeline

Streaming architecture — processes one file at a time:

1. **Extract Nodes** from AST → write to DB
2. **Extract Edges** using import map for cross-file resolution → write to DB

Memory efficient: O(1) per file, scales to any codebase size.

### Cross-File Resolution

Edge extractors use `buildImportMap` to resolve cross-file references:
- ts-morph resolves import paths (handles aliases like `@shared/*`)
- Import map constructs target IDs: `{targetPath}:{symbolName}`
- No need to validate target exists — queries use JOINs to filter dangling edges

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

**Config options** (`watch` in config):
- `debounce` — Delay in ms (default: 300)
- `usePolling` — Required for Docker/WSL2/NFS
- `pollingInterval` — Polling interval in ms (default: 1000)
- `silent` — Suppress reindex log messages

## Limitations

1. **SQLite only** — Query logic uses direct SQL. DbWriter interface exists for writes only.
2. **No tsconfig watching** — Changes to tsconfig.json require server restart.
