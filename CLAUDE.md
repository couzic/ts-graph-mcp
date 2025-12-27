# Project Guidelines

@ARCHITECTURE.md

## Philosophy

**Built for Claude Code, by Claude Code.** The agent using this tool is also its developer.

Code is fundamentally a graph — we store it as text for practical reasons, but its true nature is nodes (symbols) and edges (relationships). Grep and LSP require multiple hops to trace connections. ts-graph-mcp captures code as a graph, enabling instant traversal of entire call chains.

**Complements LSP**: LSP gives point-to-point queries. ts-graph-mcp gives transitive paths — "How does A reach B?" in one query instead of manual file-by-file tracing.

**Simplicity is a feature.** Each tool should do one thing well. If a tool tries to do multiple things, split it. The code, the architecture, the tools — all should reflect simplicity.

## Structure

Each tool has its own folder (`src/tools/<tool>/`) with shared formatting in `src/tools/shared/`.

## Documentation

| Document | Purpose |
|----------|---------|
| `ARCHITECTURE.md` | How the system works (current state) |
| `ISSUES.md` | Active bugs and tech debt |
| `ROADMAP.md` | **Future work only** — planned features not yet implemented |
| Module `CLAUDE.md` | Must-know info for that module |

Remove items from ISSUES.md/ROADMAP.md when done. Update ARCHITECTURE.md when adding features. Don't use ROADMAP.md to document completed work — push documentation down the tree: module `CLAUDE.md` > JSDoc > `ARCHITECTURE.md` (only for cross-cutting concerns).

## Code Style

- Functional style (no classes)
- Named exports only (no default exports)
- One primary export per file, named after that export:
  - **Function** → camelCase: `generateNodeId.ts`
  - **Type/Interface** → PascalCase: `Node.ts`
  - **Collections** → suffixes: `*.types.ts`, `*.schemas.ts`, `*.utils.ts`
- No `index.ts` barrel files
- Direct imports only
- Tests colocated with implementation

## Scripts

- `npm run check` — **Always use this to verify changes** (tests + build + lint)
- `npm test` — Run tests
- `npm run build` — Compile TypeScript

## Database Abstraction

Integration tests must be database-agnostic (no raw SQL in tests).

- Use query functions: `queryCallers()`, `queryCallees()`, `queryPath()`, etc.
- Use `DbWriter` interface for writes
