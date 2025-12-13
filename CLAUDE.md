# Project Guidelines

@docs/ARCHITECTURE.md

## Documentation

**Update `docs/ARCHITECTURE.md` when making significant changes:**
- Adding/removing modules or major components
- Changing data model (node types, edge types)
- Modifying MCP tools or their parameters
- Altering the data flow or indexing pipeline

## Known Issues

**CHECK `ISSUES.md` FOR KNOWN BUGS AND TECHNICAL DEBT.**

## Code Style

- Functional style (no classes)
- Named exports only (no default exports)
- File naming: Match the casing of the primary export (no index.ts barrel files)
  - Type/interface exports → PascalCase file: `Types.ts` exports `Node`, `Edge`
  - Function exports → camelCase file: `normalizeTypeText.ts` exports `normalizeTypeText`
- Tests: Use `describe(functionName.name, ...)` instead of string literals for refactoring safety

## Project Structure

- Each module must be documented with its own CLAUDE.md file. The CLAUDE.md condenses the most critical information about the module, all the "must know".
- Direct imports: `import { SqliteReader } from './db/sqlite/SqliteReader'`
- Each file exports one primary type/function matching its filename

## Scripts

- `npm run check` - Run tests, build, and lint **(always use this to verify changes)**
- `npm run build` - Compile TypeScript to `dist/`
- `npm test` - Run tests once
- `npm run test:watch` - Run tests in watch mode
- `npm run lint` - Check code with Biome
- `npm run lint:fix` - Auto-fix linting issues

## Verification

**Always run `npm run check` to verify changes are correct.** This runs tests, build, and lint in sequence.
