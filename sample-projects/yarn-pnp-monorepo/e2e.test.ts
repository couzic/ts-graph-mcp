import type { Database } from "better-sqlite3";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadConfig } from "../../src/config/configLoader.utils.js";
import { createSqliteWriter } from "../../src/db/sqlite/createSqliteWriter.js";
import {
  closeDatabase,
  openDatabase,
} from "../../src/db/sqlite/sqliteConnection.utils.js";
import { initializeSchema } from "../../src/db/sqlite/sqliteSchema.utils.js";
import { indexProject } from "../../src/ingestion/indexProject.js";
import { dependenciesOf } from "../../src/tools/dependencies-of/dependenciesOf.js";
import { dependentsOf } from "../../src/tools/dependents-of/dependentsOf.js";
import { pathsBetween } from "../../src/tools/paths-between/pathsBetween.js";

/**
 * E2E tests for yarn-pnp-monorepo sample project.
 *
 * Tests cross-package edge indexing in a nested Yarn 4 PnP workspace structure:
 * - libs/toolkit (base utilities)
 * - libs/ui (depends on toolkit)
 * - modules/app/packages/shared (depends on toolkit)
 * - modules/app/packages/frontend (depends on shared, ui)
 * - modules/app/packages/backend (depends on shared)
 * - modules/analytics-api (depends on shared, toolkit)
 *
 * Key call chains:
 * - renderDashboard -> renderButton -> formatValue
 * - renderDashboard -> validateThreshold -> clamp
 * - trackMetric -> formatValue
 */
describe("yarn-pnp-monorepo E2E tests", () => {
  let db: Database;
  let projectRoot: string;

  beforeAll(async () => {
    db = openDatabase({ path: ":memory:" });
    initializeSchema(db);

    projectRoot = import.meta.dirname;
    const config = loadConfig(`${projectRoot}/ts-graph-mcp.config.json`);
    const writer = createSqliteWriter(db);
    await indexProject(config, writer, { projectRoot });
  });

  afterAll(() => {
    closeDatabase(db);
  });

  describe("namespace imports", () => {
    it("resolves Namespace.Symbol to actual definition (not barrel file)", () => {
      // calculateArea uses MathUtils.multiply where MathUtils is a namespace re-export
      // The edge should point to libs/toolkit/src/math/operations.ts:multiply
      // NOT to libs/toolkit/src/index.ts:MathUtils or a synthetic string
      const output = dependenciesOf(
        db,
        projectRoot,
        "modules/app/packages/backend/src/api.ts",
        "calculateArea",
      );

      expect(output).toBe(
        `
## Graph

calculateArea --CALLS--> multiply

## Nodes

multiply:
  file: libs/toolkit/src/math/operations.ts
  offset: 1, limit: 3
  snippet:
    1: export function multiply(a: number, b: number): number {
    2:   return a * b;
    3: }
`.trimStart(),
      );
    });

    it("finds dependents through namespace import", () => {
      // Should find calculateArea as a caller of multiply
      const output = dependentsOf(
        db,
        projectRoot,
        "libs/toolkit/src/math/operations.ts",
        "multiply",
      );

      expect(output).toBe(
        `
## Graph

calculateArea --CALLS--> multiply

## Nodes

calculateArea:
  file: modules/app/packages/backend/src/api.ts
  offset: 18, limit: 3
  snippet:
    18: export function calculateArea(width: number, height: number): number {
  > 19:   return MathUtils.multiply(width, height);
    20: }
`.trimStart(),
      );
    });
  });

  describe("namespace imports with path alias in barrel", () => {
    // Tests the case where barrel file uses path alias:
    //   export * as StringUtils from "@/strings"
    // This is different from MathUtils which uses relative path:
    //   export * as MathUtils from "./math"

    it("resolves Namespace.Symbol through path alias to actual definition", () => {
      // formatLabel uses StringUtils.capitalize where StringUtils is re-exported
      // via path alias "@/strings" in the barrel file
      const output = dependenciesOf(
        db,
        projectRoot,
        "modules/app/packages/backend/src/api.ts",
        "formatLabel",
      );

      expect(output).toBe(
        `
## Graph

formatLabel --CALLS--> capitalize

## Nodes

capitalize:
  file: libs/toolkit/src/strings/operations.ts
  offset: 1, limit: 3
  snippet:
    1: export function capitalize(str: string): string {
    2:   return str.charAt(0).toUpperCase() + str.slice(1);
    3: }
`.trimStart(),
      );
    });

    it("finds dependents through namespace import with path alias", () => {
      // Should find formatLabel as a caller of capitalize
      const output = dependentsOf(
        db,
        projectRoot,
        "libs/toolkit/src/strings/operations.ts",
        "capitalize",
      );

      expect(output).toBe(
        `
## Graph

formatLabel --CALLS--> capitalize

## Nodes

formatLabel:
  file: modules/app/packages/backend/src/api.ts
  offset: 26, limit: 3
  snippet:
    26: export function formatLabel(label: string): string {
  > 27:   return StringUtils.capitalize(label);
    28: }
`.trimStart(),
      );
    });
  });

  describe(dependenciesOf.name, () => {
    it("finds cross-module call chain from frontend through ui to toolkit", () => {
      const output = dependenciesOf(
        db,
        projectRoot,
        "modules/app/packages/frontend/src/App.tsx",
        "renderDashboard",
      );

      expect(output).toBe(
        `
## Graph

renderDashboard --CALLS--> validateThreshold --CALLS--> clamp
renderDashboard --CALLS--> renderButton --CALLS--> formatValue

## Nodes

validateThreshold:
  file: modules/app/packages/shared/src/types.ts
  offset: 8, limit: 3
  snippet:
    8: export function validateThreshold(value: number): number {
  > 9:   return clamp(value, 0, 100);
    10: }

clamp:
  file: libs/toolkit/src/helpers.ts
  offset: 5, limit: 3
  snippet:
    5: export function clamp(value: number, min: number, max: number): number {
    6:   return Math.min(Math.max(value, min), max);
    7: }

renderButton:
  file: libs/ui/src/Button.ts
  offset: 3, limit: 3
  snippet:
    3: export function renderButton(label: string, value: number): string {
  > 4:   return \`<button>\${label}: \${formatValue(value)}</button>\`;
    5: }

formatValue:
  file: libs/toolkit/src/helpers.ts
  offset: 1, limit: 3
  snippet:
    1: export function formatValue(value: number): string {
    2:   return value.toFixed(2);
    3: }
`.trimStart(),
      );
    });

    it("finds dependencies from analytics-api to toolkit", () => {
      const output = dependenciesOf(
        db,
        projectRoot,
        "modules/analytics-api/src/tracker.ts",
        "trackMetric",
      );

      expect(output).toBe(
        `
## Graph

trackMetric --CALLS--> formatValue

## Nodes

formatValue:
  file: libs/toolkit/src/helpers.ts
  offset: 1, limit: 3
  snippet:
    1: export function formatValue(value: number): string {
    2:   return value.toFixed(2);
    3: }
`.trimStart(),
      );
    });
  });

  describe(dependentsOf.name, () => {
    it("finds all callers of toolkit.formatValue across modules", () => {
      const output = dependentsOf(
        db,
        projectRoot,
        "libs/toolkit/src/helpers.ts",
        "formatValue",
      );

      expect(output).toBe(
        `
## Graph

renderDashboard --CALLS--> renderButton --CALLS--> formatValue
trackMetric --CALLS--> formatValue
renderLoading --INCLUDES--> LoadingWrapper --CALLS--> formatValue

## Nodes

renderDashboard:
  file: modules/app/packages/frontend/src/App.tsx
  offset: 4, limit: 4
  snippet:
    4: export function renderDashboard(config: Config): string {
    5:   const threshold = validateThreshold(config.threshold);
  > 6:   return renderButton("Threshold", threshold);
    7: }

renderButton:
  file: libs/ui/src/Button.ts
  offset: 3, limit: 3
  snippet:
    3: export function renderButton(label: string, value: number): string {
  > 4:   return \`<button>\${label}: \${formatValue(value)}</button>\`;
    5: }

trackMetric:
  file: modules/analytics-api/src/tracker.ts
  offset: 4, limit: 7
  snippet:
    4: export function trackMetric(
    5:   name: string,
    6:   value: number,
    7:   config: Config,
    8: ): string {
  > 9:   return \`\${name}=\${formatValue(value)}, max=\${config.maxItems}\`;
    10: }

renderLoading:
  file: modules/app/packages/frontend/src/App.tsx
  offset: 9, limit: 3
  snippet:
    9: export function renderLoading(value: number) {
  > 10:   return <LoadingWrapper>{value}</LoadingWrapper>;
    11: }

LoadingWrapper:
  file: libs/ui/src/components/LoadingWrapper/LoadingWrapper.tsx
  offset: 3, limit: 3
  snippet:
    3: const LoadingWrapper = (value: number): string => {
  > 4:   return \`<div class="loading">\${formatValue(value)}</div>\`;
    5: };
`.trimStart(),
      );
    });

    it("finds all callers of shared.validateThreshold", () => {
      const output = dependentsOf(
        db,
        projectRoot,
        "modules/app/packages/shared/src/types.ts",
        "validateThreshold",
      );

      expect(output).toBe(
        `
## Graph

renderDashboard --CALLS--> validateThreshold
handleConfigUpdate --CALLS--> validateThreshold

## Nodes

renderDashboard:
  file: modules/app/packages/frontend/src/App.tsx
  offset: 4, limit: 4
  snippet:
    4: export function renderDashboard(config: Config): string {
  > 5:   const threshold = validateThreshold(config.threshold);
    6:   return renderButton("Threshold", threshold);
    7: }

handleConfigUpdate:
  file: modules/app/packages/backend/src/api.ts
  offset: 6, limit: 7
  snippet:
    6: export function handleConfigUpdate(input: unknown): Config {
    7:   const config = input as Config;
    8:   return {
    9:     ...config,
  > 10:     threshold: validateThreshold(config.threshold),
    11:   };
    12: }
`.trimStart(),
      );
    });
  });

  describe("path alias in barrel re-exports (reproduces real-life monorepo bug)", () => {
    // Tests path alias resolution in barrel re-exports.
    // LoadingWrapper is exported via path alias: export { default as LoadingWrapper } from "@/components/LoadingWrapper/LoadingWrapper"
    // This requires cross-package resolution to work correctly.

    it("finds dependents of LoadingWrapper through path alias barrel re-export", () => {
      // LoadingWrapper is used via JSX in frontend/App.tsx
      // The INCLUDES edge should point to the actual definition
      const output = dependentsOf(
        db,
        projectRoot,
        "libs/ui/src/components/LoadingWrapper/LoadingWrapper.tsx",
        "LoadingWrapper",
      );

      expect(output).toBe(
        `
## Graph

renderLoading --INCLUDES--> LoadingWrapper

## Nodes

renderLoading:
  file: modules/app/packages/frontend/src/App.tsx
  offset: 9, limit: 3
  snippet:
    9: export function renderLoading(value: number) {
  > 10:   return <LoadingWrapper>{value}</LoadingWrapper>;
    11: }
`.trimStart(),
      );
    });

    it("finds dependencies of renderLoading through path alias barrel re-export", () => {
      // renderLoading uses <LoadingWrapper> from @libs/ui
      // Should trace to the actual definition through the path alias in barrel
      const output = dependenciesOf(
        db,
        projectRoot,
        "modules/app/packages/frontend/src/App.tsx",
        "renderLoading",
      );

      expect(output).toBe(
        `
## Graph

renderLoading --INCLUDES--> LoadingWrapper --CALLS--> formatValue

## Nodes

LoadingWrapper:
  file: libs/ui/src/components/LoadingWrapper/LoadingWrapper.tsx
  offset: 3, limit: 3
  snippet:
    3: const LoadingWrapper = (value: number): string => {
  > 4:   return \`<div class="loading">\${formatValue(value)}</div>\`;
    5: };

formatValue:
  file: libs/toolkit/src/helpers.ts
  offset: 1, limit: 3
  snippet:
    1: export function formatValue(value: number): string {
    2:   return value.toFixed(2);
    3: }
`.trimStart(),
      );
    });
  });

  describe("cross-package edge resolution (text-utils vs error-utils)", () => {
    // Reproduces an issue where cross-package edges fail based on package configuration.
    // Key differences between text-utils and error-utils:
    // | Aspect                | text-utils        | error-utils       |
    // |-----------------------|-------------------|-------------------|
    // | types in package.json | null              | "dist/index.d.ts" |
    // | paths in tsconfig     | 1 path alias      | 12 path aliases   |
    // | declarationMap        | not set           | true              |
    // | index.ts export style | export * from     | export { x } from |

    it("finds both toUpperCase and formatError as dependencies", () => {
      const output = dependenciesOf(
        db,
        projectRoot,
        "modules/app/packages/backend/src/api.ts",
        "processInput",
      );

      // Both edges should be found
      expect(output).toContain("toUpperCase");
      expect(output).toContain("formatError");
      expect(output).toContain("libs/text-utils/src/utils.ts");
      expect(output).toContain("libs/error-utils/src/utils.ts");
    });

    it("finds dependents of toUpperCase from text-utils", () => {
      const output = dependentsOf(
        db,
        projectRoot,
        "libs/text-utils/src/utils.ts",
        "toUpperCase",
      );

      expect(output).toContain("processInput");
    });

    it("finds dependents of formatError from error-utils", () => {
      const output = dependentsOf(
        db,
        projectRoot,
        "libs/error-utils/src/utils.ts",
        "formatError",
      );

      // This is the failing case - if the bug exists, this will fail
      expect(output).toContain("processInput");
    });
  });

  describe(pathsBetween.name, () => {
    it("finds direct path from analytics-api to toolkit", () => {
      const output = pathsBetween(
        db,
        projectRoot,
        {
          file_path: "modules/analytics-api/src/tracker.ts",
          symbol: "trackMetric",
        },
        { file_path: "libs/toolkit/src/helpers.ts", symbol: "formatValue" },
      );

      expect(output).toBe(
        `
## Graph

trackMetric --CALLS--> formatValue
`.trim(),
      );
    });

    it("finds multi-hop path from frontend through shared to toolkit", () => {
      const output = pathsBetween(
        db,
        projectRoot,
        {
          file_path: "modules/app/packages/frontend/src/App.tsx",
          symbol: "renderDashboard",
        },
        { file_path: "libs/toolkit/src/helpers.ts", symbol: "clamp" },
      );

      expect(output).toBe(
        `
## Graph

renderDashboard --CALLS--> validateThreshold --CALLS--> clamp

## Nodes

validateThreshold:
  file: modules/app/packages/shared/src/types.ts
  offset: 8, limit: 3
  snippet:
    8: export function validateThreshold(value: number): number {
  > 9:   return clamp(value, 0, 100);
    10: }
`.trimStart(),
      );
    });

    it("returns no path between unconnected packages (backend has no ui dependency)", () => {
      const output = pathsBetween(
        db,
        projectRoot,
        {
          file_path: "modules/app/packages/backend/src/api.ts",
          symbol: "handleConfigUpdate",
        },
        { file_path: "libs/ui/src/Button.ts", symbol: "renderButton" },
      );

      expect(output).toBe("No path found.");
    });
  });
});
