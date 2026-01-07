# Project Guidelines

@ARCHITECTURE.md
@README.md

## Philosophy

**Built for Claude Code, by Claude Code.** The agent using this tool is also its developer.

Code is fundamentally a graph — we store it as text for practical reasons, but its true nature is nodes (symbols) and edges (relationships). Grep and LSP require multiple hops to trace connections. ts-graph captures code as a graph, enabling instant traversal of entire call chains.

**Complements LSP**: LSP gives point-to-point queries. ts-graph gives transitive paths — "How does A reach B?" in one query instead of manual file-by-file tracing.

**Simplicity is a feature.** Each tool should do one thing well. If a tool tries to do multiple things, split it. The code, the architecture, the tools — all should reflect simplicity.

## Structure

Monorepo with 4 internal workspace packages:

| Package | Purpose |
|---------|---------|
| `shared/` | Types and interfaces used by all packages |
| `http/` | HTTP server (Express), REST API, serves UI |
| `mcp/` | MCP stdio wrapper (calls HTTP API) |
| `ui/` | React SPA (Vite build) |

Root `main.ts` dispatches to HTTP server or MCP wrapper based on `--mcp` flag.

Query tools live in `http/src/query/<tool>/` with shared formatting in `http/src/query/shared/`.

## Documentation

| Document | Purpose | Audience |
|----------|---------|----------|
| `README.md` | Practical usage: installation, configuration, examples | **Users** |
| `ARCHITECTURE.md` | Technical internals: data model, design decisions, code flow | **Contributors** |
| `ISSUES.md` | Active bugs and tech debt | Contributors |
| `ROADMAP.md` | **Future work only** — planned features not yet implemented | Contributors |
| Module `CLAUDE.md` | Must-know info for that module | Contributors |

Remove items from ISSUES.md/ROADMAP.md when done. Update ARCHITECTURE.md when adding features. Don't use ROADMAP.md to document completed work — push documentation down the tree: module `CLAUDE.md` > JSDoc > `ARCHITECTURE.md` (only for cross-cutting concerns).

## Code Style

- Functional style (no classes)
- Named exports only (no default exports)
- One primary export per file, named after that export:
  - **Function** → camelCase: `generateNodeId.ts`
  - **Type/Interface** → PascalCase: `Node.ts`
  - **Collections** → suffixes: `*.types.ts`, `*.schemas.ts`, `*.utils.ts`
- No `index.ts` barrel files (except `shared/src/index.ts` for types)
- Direct imports only
- Tests colocated with implementation

## Scripts

- `npm run check` — **Always use this to verify changes** (tests + build + lint)
- `npm test` — Run tests
- `npm run build` — Compile TypeScript + build UI

## Database Abstraction

Integration tests must be database-agnostic (no raw SQL in tests).

- Use query functions: `queryCallers()`, `queryCallees()`, `queryPath()`, etc.
- Use `DbWriter` interface for writes
