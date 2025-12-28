# Yarn PnP Monorepo Sample Project

Tests that ts-graph-mcp correctly indexes cross-package edges in a **Yarn 4 Plug'n'Play (PnP)** monorepo without relying on tsconfig `paths`.

## Why This Matters

Most sample projects use tsconfig `paths` for cross-package imports:

```json
// tsconfig.json with paths (the easy way)
{
  "compilerOptions": {
    "paths": {
      "@libs/toolkit": ["../../libs/toolkit/src/helpers.ts"]
    }
  }
}
```

Real Yarn PnP monorepos don't use `paths`. They rely on:
1. `package.json` dependencies with `workspace:*` protocol
2. Yarn's `.pnp.cjs` for runtime resolution

This sample project validates that ts-graph-mcp works with **pure PnP resolution**.

## How PnP Resolution Works

### Traditional Node.js (node_modules)
```
import { foo } from "@libs/toolkit"
       ↓
Node looks in: ./node_modules/@libs/toolkit/
       ↓
Finds: ./node_modules/@libs/toolkit/src/helpers.ts
```

### Yarn PnP (no node_modules)
```
import { foo } from "@libs/toolkit"
       ↓
.pnp.cjs intercepts require()
       ↓
Looks up package location in PnP map
       ↓
Returns: /path/to/libs/toolkit/src/helpers.ts
```

### ts-graph-mcp Integration

ts-morph (our AST parser) needs to resolve imports at parse time, not runtime. We bridge this gap in `src/ingestion/createProject.ts`:

```typescript
// Simplified flow
const pnpApi = require(".pnp.cjs");

const project = new Project({
  tsConfigFilePath,
  resolutionHost: () => ({
    resolveModuleNames: (moduleNames, containingFile) => {
      return moduleNames.map(name => {
        // Use PnP API instead of filesystem lookup
        const resolved = pnpApi.resolveRequest(name, containingFile);
        return { resolvedFileName: resolved };
      });
    },
  }),
});
```

## Project Structure

```
yarn-pnp-monorepo/
├── .pnp.cjs              # Yarn PnP resolution map (generated)
├── .pnp.loader.mjs       # ESM loader (generated)
├── .yarnrc.yml           # Yarn config: nodeLinker: pnp
├── package.json          # Root workspace definition
├── yarn.lock             # Dependency lock file
├── tsconfig.json         # Root TS config with references
├── ts-graph-mcp.config.json
├── e2e.test.ts
├── libs/
│   ├── toolkit/          # Base utilities (no deps)
│   │   └── src/helpers.ts    → formatValue(), clamp()
│   └── ui/               # UI components
│       └── src/Button.ts     → renderButton() calls formatValue()
└── modules/
    ├── app/packages/
    │   ├── shared/       # Shared types
    │   │   └── src/types.ts  → Config, validateThreshold() calls clamp()
    │   ├── frontend/     # Frontend app
    │   │   └── src/App.ts    → renderDashboard() calls validateThreshold(), renderButton()
    │   └── backend/      # Backend API
    │       └── src/api.ts    → handleConfigUpdate() calls validateThreshold()
    └── analytics-api/    # Analytics module
        └── src/tracker.ts    → trackMetric() calls formatValue()
```

## Dependency Graph

```
@libs/toolkit (base - no dependencies)
     ↑
     ├── @libs/ui
     ├── @app/shared
     │        ↑
     │        ├── @app/frontend (also depends on @libs/ui)
     │        ├── @app/backend
     │        └── @modules/analytics-api (also depends on @libs/toolkit)
```

## Key Constraints

### Base Package Imports Only

PnP resolves **base package** imports out of the box:

```typescript
// ✅ Works with PnP
import { formatValue } from "@libs/toolkit";

// ❌ Requires "exports" field in package.json
import { formatValue } from "@libs/toolkit/helpers";
```

Subpath imports (`@libs/toolkit/helpers`) require the target package to declare an `exports` field. Real monorepos typically use base package imports, so this sample project follows that pattern.

### Dependencies Must Be Declared

PnP enforces strict dependency declarations. If `@app/frontend` imports from `@libs/ui`, it must list `@libs/ui` in its `package.json`:

```json
{
  "name": "@app/frontend",
  "dependencies": {
    "@libs/ui": "workspace:*"
  }
}
```

Unlike `node_modules` hoisting, PnP won't let you "accidentally" import undeclared dependencies.

### No tsconfig paths

The tsconfig files in this project have **no `paths` or `baseUrl`**. All cross-package resolution happens through PnP:

```json
{
  "compilerOptions": {
    "module": "NodeNext",
    "moduleResolution": "NodeNext"
    // No paths!
  }
}
```

## E2E Test Coverage

| Test | Tool | What It Validates |
|------|------|-------------------|
| Frontend → UI → Toolkit | `dependenciesOf` | Multi-hop chain across 3 packages |
| Analytics → Toolkit | `dependenciesOf` | Direct cross-module dependency |
| Toolkit ← all callers | `dependentsOf` | Reverse lookup finds callers in 3 packages |
| Shared ← callers | `dependentsOf` | Finds frontend, backend, analytics |
| Analytics → Toolkit path | `pathsBetween` | Direct path across modules |
| Frontend → Toolkit path | `pathsBetween` | Multi-hop path through shared |
| Backend → UI (no path) | `pathsBetween` | Correctly returns "no path" |

## Regenerating PnP Files

After modifying `package.json` dependencies:

```bash
cd sample-projects/yarn-pnp-monorepo
yarn install
```

This regenerates `.pnp.cjs` with the updated dependency map.

## Debugging PnP Resolution

To test if PnP can resolve an import:

```typescript
import { createRequire } from "node:module";

const pnpPath = "/path/to/yarn-pnp-monorepo/.pnp.cjs";
const require = createRequire(pnpPath);
const pnpApi = require(pnpPath);

// Test resolution
const result = pnpApi.resolveRequest(
  "@libs/toolkit",           // package to resolve
  "/path/to/App.ts",         // file making the import
  { extensions: [".ts"] }
);
console.log(result);  // => /path/to/libs/toolkit/src/helpers.ts
```

## Files Not Committed to Git

These are generated by `yarn install` and listed in `.gitignore`:

- `.pnp.cjs` - PnP resolution map
- `.pnp.loader.mjs` - ESM loader hook
- `.yarn/cache/` - Package cache (if any external deps)
