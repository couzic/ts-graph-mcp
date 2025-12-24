# Architecture

**ts-graph-mcp** is an MCP server that extracts TypeScript code structure into a queryable graph database.

## Overview

The graph captures:
- **Nodes**: Code symbols (functions, classes, methods, interfaces, types, variables, files, properties)
- **Edges**: Relationships between symbols (calls, imports, type usage, inheritance, etc.)

The MCP server exposes tools for AI agents to traverse call graphs, find paths between symbols, and analyze package dependencies.

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        MCP Server Layer                         │
│              (startMcpServer.ts dispatches to tool handlers)    │
├─────────────────────────────────────────────────────────────────┤
│                     Vertical Slice Tools                        │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐            │
│  │incomingCalls │ │outgoingCalls │ │  findPaths   │    ...     │
│  │  handler.ts  │ │  handler.ts  │ │  handler.ts  │            │
│  │  query.ts    │ │  query.ts    │ │  query.ts    │            │
│  │  format.ts   │ │  format.ts   │ │  format.ts   │            │
│  └──────┬───────┘ └──────┬───────┘ └──────┬───────┘            │
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

**Vertical slices**: Each MCP tool owns its complete stack (`src/tools/<tool>/`). See module CLAUDE.md files for details.

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

| Category | Tool | Purpose |
|----------|------|---------|
| **Call Graph** | `incomingCallsDeep` | Find callers (transitive) |
| | `outgoingCallsDeep` | Find callees (transitive) |
| **Package Deps** | `incomingPackageDeps` | Find reverse package deps |
| | `outgoingPackageDeps` | Find package dependencies |
| **Analysis** | `analyzeImpact` | Impact analysis |
| | `findPaths` | Find paths between symbols |

See [`src/tools/CLAUDE.md`](src/tools/CLAUDE.md) for parameter details.

## LSP Overlap

Claude Code has a built-in LSP tool. Use each for its strengths:

| LSP | ts-graph-mcp |
|-----|--------------|
| Real-time, no indexing lag | Pre-indexed, instant complex queries |
| Point-to-point (definition, direct refs) | Transitive (callers of callers) |
| Single function context | Path finding (A → B) |

## Limitations

1. **SQLite only** — Query logic uses direct SQL. DbWriter interface exists for writes only.
2. **No file watching** — Server requires restart to pick up code changes.
