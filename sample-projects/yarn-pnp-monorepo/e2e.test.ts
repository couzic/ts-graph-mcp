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

  describe(dependenciesOf.name, () => {
    it("finds cross-module call chain from frontend through ui to toolkit", () => {
      const output = dependenciesOf(
        db,
        projectRoot,
        "modules/app/packages/frontend/src/App.ts",
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

## Nodes

renderDashboard:
  file: modules/app/packages/frontend/src/App.ts
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
  file: modules/app/packages/frontend/src/App.ts
  offset: 4, limit: 4
  snippet:
    4: export function renderDashboard(config: Config): string {
  > 5:   const threshold = validateThreshold(config.threshold);
    6:   return renderButton("Threshold", threshold);
    7: }

handleConfigUpdate:
  file: modules/app/packages/backend/src/api.ts
  offset: 3, limit: 7
  snippet:
    3: export function handleConfigUpdate(input: unknown): Config {
    4:   const config = input as Config;
    5:   return {
    6:     ...config,
  > 7:     threshold: validateThreshold(config.threshold),
    8:   };
    9: }
`.trimStart(),
      );
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
          file_path: "modules/app/packages/frontend/src/App.ts",
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
