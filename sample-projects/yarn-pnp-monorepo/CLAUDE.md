# Yarn PnP Monorepo Sample Project

Tests cross-package edge indexing in a Yarn 4 PnP monorepo.

## What This Tests

Real Yarn PnP monorepos don't use tsconfig `paths` for cross-package imports. They rely on `package.json` dependencies with `workspace:*` protocol and Yarn's `.pnp.cjs` for resolution. This sample project validates that ts-graph works with pure PnP resolution.

## Packages (8)

| Package | Path | Key Symbols |
|---------|------|-------------|
| toolkit | `libs/toolkit/` | `formatValue()`, `clamp()`, `MathUtils.*`, `StringUtils.*` |
| @libs/ui | `libs/ui/` | `renderButton()`, `LoadingWrapper` |
| text-utils | `libs/text-utils/` | `toUpperCase()` |
| error-utils | `libs/error-utils/` | `formatError()` |
| shared | `modules/app/packages/shared/` | `Config`, `validateThreshold()` |
| frontend | `modules/app/packages/frontend/` | `renderDashboard()`, `renderLoading()` |
| backend | `modules/app/packages/backend/` | `handleConfigUpdate()`, `calculateArea()`, `formatLabel()`, `processInput()` |
| analytics-api | `modules/analytics-api/` | `trackMetric()` |

## Resolution Patterns Exercised

### Namespace imports through barrel file
`backend/api.ts` imports `{ MathUtils }` from `@libs/toolkit`. The barrel file re-exports `MathUtils` from `"./math"` (relative path). `calculateArea()` calls `MathUtils.multiply()`.

### Namespace imports through path alias
`backend/api.ts` imports `{ StringUtils }` from `@libs/toolkit`. The barrel file re-exports `StringUtils` from `"@/strings"` (path alias in `libs/toolkit/tsconfig.json`). `formatLabel()` calls `StringUtils.capitalize()`. Requires `ProjectRegistry` for cross-package path alias resolution.

### Path alias in barrel re-exports
`libs/ui/src/index.ts` re-exports `LoadingWrapper` via `"@/components/LoadingWrapper/LoadingWrapper"` (path alias in `libs/ui/tsconfig.json`). `frontend/App.tsx` imports and uses `<LoadingWrapper>` as JSX.

### Cross-package edge resolution variants
`backend/api.ts` imports from both `@libs/text-utils` and `@libs/error-utils`. These packages differ in `types` field (`null` vs `"dist/index.d.ts"`), export style (`export *` vs `export { x }`), and tsconfig configuration.

## Regenerating PnP Files

After modifying `package.json` dependencies:

```bash
cd sample-projects/yarn-pnp-monorepo
yarn install
```
