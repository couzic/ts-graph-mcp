# Project Guidelines

@ARCHITECTURE.md @README.md

## Philosophy

**Built for Claude Code, by Claude Code.** The agent using this tool is also its
developer.

Code is fundamentally a graph — we store it as text for practical reasons, but
its true nature is nodes (symbols) and edges (relationships). Grep and LSP
require multiple hops to trace connections. ts-graph captures code as a graph,
enabling instant traversal of entire call chains.

**Complements LSP**: LSP gives point-to-point queries. ts-graph gives transitive
paths — "How does A reach B?" in one query instead of manual file-by-file
tracing.

**Simplicity is a feature.** Each tool should do one thing well. If a tool tries
to do multiple things, split it. The code, the architecture, the tools — all
should reflect simplicity.

## Structure

Monorepo with 4 internal workspace packages:

| Package   | Purpose                                    |
| --------- | ------------------------------------------ |
| `shared/` | Types and interfaces used by all packages  |
| `http/`   | HTTP server (Express), REST API, serves UI |
| `mcp/`    | MCP stdio wrapper (calls HTTP API)         |
| `ui/`     | React SPA (Vite build)                     |

Root `main.ts` dispatches to HTTP server or MCP wrapper based on `--mcp` flag.

Query tools live in `http/src/query/<tool>/` with shared formatting in
`http/src/query/shared/`.

## Documentation

| Document           | Purpose                                                      | Audience         |
| ------------------ | ------------------------------------------------------------ | ---------------- |
| `README.md`        | Practical usage: installation, configuration, examples       | **Users**        |
| `ARCHITECTURE.md`  | Technical internals: data model, design decisions, code flow | **Contributors** |
| `ISSUES.md`        | Active bugs and tech debt                                    | Contributors     |
| `ROADMAP.md`       | **Future work only** — planned features not yet implemented  | Contributors     |
| Module `CLAUDE.md` | Must-know info for that module                               | Contributors     |

**No history in docs.** ISSUES.md and ROADMAP.md describe current state and
future work — never past. When work is done: delete the item entirely, don't add
"Done" sections or checkboxes. Document completed features in the appropriate
place: module `CLAUDE.md` > JSDoc > `ARCHITECTURE.md` (only for cross-cutting
concerns).

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

## Testing

**File naming:**

- `*.test.ts` — Unit tests (pure functions, no I/O)
- `*.integration.test.ts` — Integration tests (multiple components, in-memory
  DB, real dependencies)
- `*.e2e.test.ts` — End-to-end tests (full server, sample projects)

**Conventions:**

- Use vitest (never jest)
- Test names: direct form, no "should" prefix → `it('finds dependencies', ...)`
- Never mock imports — use real dependencies or in-memory implementations

## Scripts

- `npm run check` — **Always use this to verify changes** (tests + build + lint)
- `npm test` — Run tests
- `npm run build` — Compile TypeScript + build UI

## Database Abstraction

Integration tests must be database-agnostic (no raw SQL in tests).

- Use query functions: `queryCallers()`, `queryCallees()`, `queryPath()`, etc.
- Use `DbWriter` interface for writes

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:

- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

**Critical thinking over agreement.** When the user asks for your opinion,
actually think. Don't reflexively agree. If the user says "I think X is better,
what do you think?" — consider whether X is actually better. Present
counterarguments if they exist. The user needs honest feedback, not validation.
Agreeing without thinking has no value.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes,
simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:

- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:

- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:

- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:

```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it
work") require constant clarification.
