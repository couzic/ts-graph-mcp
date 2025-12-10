# Project Guidelines

## Known Issues

**CHECK `ISSUES.md` FOR KNOWN BUGS AND TECHNICAL DEBT.**

## Session Status

**READ `SESSION_STATUS.md` AT START OF EACH SESSION.**

**UPDATE `SESSION_STATUS.md` AT EACH IMPORTANT TRANSITION:**
- When completing a feature or task
- When making a design decision
- When switching focus to a different area
- Before ending a session
- When blocked or waiting on user input

## Code Style

- Functional style (no classes)
- Named exports only (no default exports)
- File naming: PascalCase, named after primary export (no index.ts barrel files)

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
