# Yarn PnP Monorepo Sample Project

Tests that ts-graph correctly indexes cross-package edges in a **Yarn 4 Plug'n'Play (PnP)** monorepo without relying on tsconfig `paths`.

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

This sample project validates that ts-graph works with **pure PnP resolution**.

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

### ts-graph Integration

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
├── ts-graph-mcp.config.json
├── e2e.test.ts
├── libs/
│   ├── toolkit/          # Base utilities (no deps)
│   │   └── src/helpers.ts    → formatValue(), clamp()
│   └── ui/               # UI components (uses path aliases internally)
│       ├── tsconfig.json     → paths: { "@/components/*": ["src/components/*"] }
│       └── src/
│           ├── index.ts      → barrel file with path alias re-export (BUG)
│           ├── Button.ts     → renderButton() calls formatValue()
│           └── components/LoadingWrapper/LoadingWrapper.ts → LoadingWrapper()
└── modules/
    ├── app/packages/
    │   ├── shared/       # Shared types
    │   │   └── src/types.ts  → Config, validateThreshold() calls clamp()
    │   ├── frontend/     # Frontend app
    │   │   └── src/App.ts    → renderDashboard(), renderLoading() (BUG: LoadingWrapper edge broken)
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

### No tsconfig paths or references

The tsconfig files in this project have **no `paths`, `baseUrl`, or `references`**. All cross-package resolution happens through PnP:

```json
{
  "compilerOptions": {
    "module": "NodeNext",
    "moduleResolution": "NodeNext"
    // No paths, no references!
  }
}
```

**Why no `references`?** TypeScript project references enable `tsc --build` for incremental compilation, but they're separate from module resolution. Yarn PnP handles where packages are located; references only affect build order. This sample project omits them to demonstrate pure PnP resolution without any TypeScript-level cross-project configuration.

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

## Cross-Package Path Alias Resolution

This sample project tests cross-package dependency tracing when a barrel file uses path aliases in its re-exports.

### Setup

```
libs/ui/tsconfig.json:
  paths: { "@/components/*": ["src/components/*"] }

libs/ui/src/index.ts:
  export * from "./Button";  // relative path
  export { default as LoadingWrapper } from "@/components/LoadingWrapper/LoadingWrapper";  // path alias

frontend/App.ts:
  import { LoadingWrapper, renderButton } from "@libs/ui";
```

### How It Works

1. When indexing frontend, `import "@libs/ui"` resolves to `libs/ui/src/index.ts`
2. The barrel re-export uses `@/components/*` path alias
3. `ProjectRegistry` provides the correct ts-morph Project for `libs/ui`
4. `buildImportMap.ts` uses the correct Project context to resolve the path alias
5. Edge correctly points to: `libs/ui/src/components/LoadingWrapper/LoadingWrapper.ts:LoadingWrapper`

### E2E Tests

Two tests in `e2e.test.ts` under "path alias in barrel re-exports" verify this works correctly.
