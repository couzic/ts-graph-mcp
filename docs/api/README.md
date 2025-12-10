# API Documentation

This directory contains the interface specifications for all modules.

## Files

| File | Module | Purpose |
|------|--------|---------|
| [01-shared-types.md](./01-shared-types.md) | `src/db/types.ts` | Node, Edge, Path, and filter types |
| [02-db-reader.md](./02-db-reader.md) | `src/db/reader.ts` | Read-only graph queries |
| [03-db-writer.md](./03-db-writer.md) | `src/db/writer.ts` | Graph write operations |
| [04-ingestion.md](./04-ingestion.md) | `src/ingestion/` | TypeScript parsing and extraction |
| [05-watcher.md](./05-watcher.md) | `src/watcher/` | Filesystem watching |
| [06-config.md](./06-config.md) | `src/config/` | Project configuration schema |

## Module Dependency Graph

```
┌─────────────────────────────────────────────────────────────┐
│                         CLI                                  │
│  (imports: Config, Ingestion, Watcher, DB)                  │
└─────────────────────────────────────────────────────────────┘
                              │
            ┌─────────────────┼─────────────────┐
            ▼                 ▼                 ▼
┌───────────────────┐ ┌──────────────┐ ┌──────────────────┐
│   MCP Server      │ │   Watcher    │ │    Ingestion     │
│ (imports: DB)     │ │(imports: DB, │ │ (imports: DB)    │
│ (uses: DbReader)  │ │  Ingestion)  │ │ (uses: DbWriter) │
└───────────────────┘ └──────────────┘ └──────────────────┘
            │                 │                 │
            └─────────────────┼─────────────────┘
                              ▼
              ┌───────────────────────────────┐
              │        DB Interface           │
              │  (types, reader.ts, writer.ts)│
              └───────────────────────────────┘
                              │
              ┌───────────────┴───────────────┐
              ▼                               ▼
      ┌──────────────┐               ┌──────────────┐
      │    SQLite    │               │   Memgraph   │
      │   Adapter    │               │   Adapter    │
      └──────────────┘               └──────────────┘
```

## Error Handling

All modules follow **fail-fast** error handling:

- Batch operations throw on first error
- File operations throw if file cannot be read/parsed
- Query operations return empty results for non-existent nodes
- Config validation throws `ZodError` with details
