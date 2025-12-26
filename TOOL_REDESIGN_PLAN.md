# Tool Redesign Implementation Plan

> Tracks implementation progress for the simplified 3-tool API.

**Design doc:** `TOOL_API_REDESIGN.md`

## Context

This is a **major overhaul**. All previous code is considered deprecated. We will scavenge useful pieces and delete the rest. Focus is on new code and new tests, done in a disciplined, structured way.

**What's stable:**
- Output format (defined in `TOOL_API_REDESIGN.md`)

**What's WIP:**
- Everything else (internal structure, snippet extraction, etc.)

## Goals

Replace 6 tools with 3:
- `dependentsOf` — "Who depends on this?"
- `dependenciesOf` — "What does this depend on?"
- `pathsBetween` — "How does A reach B?"

## Tool Architecture

Each tool is a **single function** that returns formatted string output:

```
src/tools/dependencies-of/dependenciesOf.ts
  → dependenciesOf(db, projectRoot, filePath, symbol) → string

src/tools/dependents-of/dependentsOf.ts
  → dependentsOf(db, projectRoot, filePath, symbol) → string

src/tools/paths-between/pathsBetween.ts
  → pathsBetween(db, projectRoot, from, to) → string
```

The MCP handler is a thin wrapper that extracts params and calls the tool function.

## E2E Test Strategy

**E2E tests call the tool functions directly** and assert on the formatted output:

```typescript
// E2E test calls the TOOL (not internal query functions)
const output = dependenciesOf(db, projectRoot, "src/step01.ts", "entry");

// Assert on the REAL OUTPUT that Claude sees
expect(output).toContain("## Graph (4 edges)");
expect(output).toContain("entry --CALLS--> step02");
```

This tests the complete pipeline: **source code → indexing → tool → formatted output**.

## Work Items

### Must Do

- [ ] Implement `dependenciesOf` tool
- [ ] Implement `dependentsOf` tool
- [ ] Implement `pathsBetween` tool
- [ ] Remove old tools

### Design Decisions (WIP)

- **Internal structure** — TBD, iterate as we implement
- **Snippet extraction** — TBD

## Current State

- [x] Design doc complete (`TOOL_API_REDESIGN.md`)
- [x] First E2E test file: `call-chain/direct-call` (10 tests)
- [ ] Implementation
- [ ] More E2E test files (iterative)

## E2E Test Coverage (Iterative)

We will build up hundreds of E2E tests covering all edge cases. Each scenario gets its own test file.

### Done
- `call-chain/direct-call` — Basic linear call chain (10 tests)

### Planned (non-exhaustive)
- Symbol disambiguation (#N suffix)
- Large result sets (snippets omitted)
- Empty results / symbol not found
- REFERENCES edges (callbacks, stored functions)
- EXTENDS edges (class inheritance)
- IMPLEMENTS edges (interface implementation)
- Cycles in call graph
- Cross-module paths
- Cross-package paths
- Mixed edge types in single path
- ...
