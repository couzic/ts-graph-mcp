# Path Aliases Sample Project

Tests transparent re-exports through barrel files with TypeScript path aliases.

## Design Principle: Transparent Re-exports

**Barrel files are INVISIBLE in the graph.** No nodes, no edges, nothing.

```typescript
// consumer.ts
import { formatValue } from './index';  // barrel file
formatValue();
```

Graph shows: `consumer.ts:displayValue --CALLS--> src/utils/helper.ts:formatValue`

**NOT:** `consumer.ts --CALLS--> src/index.ts:...` (barrel file invisible)

This is achieved at **indexing time** by following re-export chains to actual definitions.

## Project Structure

```
path-aliases/
├── tsconfig.json           # Has "paths": { "@/*": ["src/*"] }
├── ts-graph-mcp.config.json
├── src/
│   ├── index.ts            # Barrel file - re-exports via path alias
│   ├── consumer.ts         # Imports from barrel, calls formatValue
│   └── utils/
│       └── helper.ts       # Actual implementation
└── e2e.test.ts             # E2E tests verifying transparent re-exports
```

## E2E Test Coverage

| Test | Description |
|------|-------------|
| CALLS edge to actual definition | Edge skips barrel, points to helper.ts |
| Real callers as dependents | consumer.ts found, not index.ts |
| Barrel file invisibility | No symbol nodes for re-exports |
