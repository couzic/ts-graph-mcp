# Project Guidelines

@ARCHITECTURE.md

## Documentation Strategy

Each document has a specific purpose — keep them focused:

| Document | Purpose | Rule |
|----------|---------|------|
| `ARCHITECTURE.md` | How the system works now | Update when adding features, changing patterns |
| `ISSUES.md` | Active bugs and tech debt | Only open issues; remove when fixed |
| `ROADMAP.md` | Future plans | Only upcoming work; remove when done |
| Module `CLAUDE.md` | AI context for that module | Must-know info for working in that module |

**When completing work:**
- Remove items from ISSUES.md/ROADMAP.md
- Document the resulting patterns in ARCHITECTURE.md
- Don't track completion history (no CHANGELOG until release)

**Quick references:**
- **Known bugs/debt** → check `ISSUES.md`
- **What to work on next** → check `ROADMAP.md`

**Update `ARCHITECTURE.md` when making significant changes:**
- Adding/removing modules or major components
- Changing data model (node types, edge types)
- Modifying MCP tools or their parameters
- Altering the data flow or indexing pipeline

## Code Style

- Functional style (no classes)
- Named exports only (no default exports)
- File naming: One primary export per file, named after that export
  - **Function** → camelCase: `generateNodeId.ts` exports `generateNodeId`
  - **Type/Interface/Class** → PascalCase: `Node.ts` exports `Node`
  - **Collection files** use suffixes when multiple related exports are needed:
    - `*.types.ts` - Type/interface collections: `Config.types.ts`
    - `*.schemas.ts` - Zod schema collections: `Config.schemas.ts`
    - `*.utils.ts` - Utility function collections: `sqliteConnection.utils.ts`
    - `*.constants.ts` - Constant collections: `query.constants.ts`
  - No `index.ts` barrel files
- Tests: Use `describe(functionName.name, ...)` instead of string literals for refactoring safety

## Project Structure

- Each module must be documented with its own CLAUDE.md file. The CLAUDE.md condenses the most critical information about the module, all the "must know".
- Direct imports: `import { createSqliteWriter } from './db/sqlite/createSqliteWriter.js'`
- Each file exports one primary item matching its filename (see File naming convention above)

## Scripts

- `npm run check` - Run tests, build, and lint **(always use this to verify changes)**
- `npm run build` - Compile TypeScript to `dist/`
- `npm test` - Run tests once
- `npm run test:watch` - Run tests in watch mode
- `npm run lint` - Check code with Biome
- `npm run lint:fix` - Auto-fix linting issues

## Verification

**Always run `npm run check` to verify changes are correct.** This runs tests, build, and lint in sequence.

## Database Abstraction

Integration tests MUST be database-agnostic. When we switch to Neo4j/Memgraph, all tests must still pass.

**Rules:**
- ❌ NEVER use `db.prepare()`, raw SQL, or SQLite-specific APIs in tests
- ✅ Use query functions: `querySearchNodes()`, `queryCallers()`, `queryCallees()`, `queryEdges()`, etc.
- ✅ Use `DbWriter` interface for writes: `writer.addNodes()`, `writer.addEdges()`

**Query functions** (import from `src/`):
- `queryNodes(db, pattern, filters?)` - Search nodes by name pattern (import from `src/db/queryNodes.js`)
- `queryCallers(db, nodeId, options?)` - Find callers of a function
- `queryCallees(db, nodeId, maxDepth?)` - Find callees of a function
- `queryEdges(db, filters?)` - Query edges with filters (type, sourcePattern, targetPattern, etc.)
- `queryImpactedNodes(db, nodeId, options?)` - Impact analysis
- `queryPath(db, sourceId, targetId)` - Find shortest path
- `queryNeighbors(db, nodeId, distance, direction?)` - Get neighborhood subgraph
