import { join } from "node:path";
import type { Database } from "better-sqlite3";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { ProjectConfig } from "../../../../src/config/Config.schemas.js";
import { createSqliteWriter } from "../../../../src/db/sqlite/createSqliteWriter.js";
import {
  closeDatabase,
  openDatabase,
} from "../../../../src/db/sqlite/sqliteConnection.utils.js";
import { initializeSchema } from "../../../../src/db/sqlite/sqliteSchema.utils.js";
import { indexProject } from "../../../../src/ingestion/indexProject.js";
import { dependenciesOf } from "../../../../src/tools/dependencies-of/dependenciesOf.js";
import { dependentsOf } from "../../../../src/tools/dependents-of/dependentsOf.js";
import { pathsBetween } from "../../../../src/tools/paths-between/pathsBetween.js";

/**
 * E2E tests for indirect function calls (variable alias pattern).
 *
 * Pattern: const fn = target; fn();
 *
 * Chain: entry → step02 → step03 → step04 → step05
 * Each step stores the next function in a variable before calling it.
 */
describe("indirect-call E2E tests", () => {
  let db: Database;
  let projectRoot: string;

  beforeAll(async () => {
    db = openDatabase({ path: ":memory:" });
    initializeSchema(db);

    projectRoot = join(import.meta.dirname, "../..");
    const config: ProjectConfig = {
      modules: [
        {
          name: "test",
          packages: [{ name: "main", tsconfig: "tsconfig.json" }],
        },
      ],
    };
    const writer = createSqliteWriter(db);
    await indexProject(config, writer, { projectRoot });
  });

  afterAll(() => {
    closeDatabase(db);
  });

  describe("dependenciesOf", () => {
    it("finds all callees of entry (via variable aliases)", () => {
      const output = dependenciesOf(
        db,
        projectRoot,
        "src/indirect-call/entry.ts",
        "entry",
      );

      expect(output).toBe(`## Graph

entry --CALLS--> step02 --CALLS--> step03 --CALLS--> step04 --CALLS--> step05

## Nodes

step03:
  file: src/indirect-call/core/step03.ts
  offset: 4, limit: 4
  snippet:
    4: export function step03(): string {
    5:   const nextStep = step04;
    6:   return \`\${nextStep()}-03\`;
    7: }

step02:
  file: src/indirect-call/handlers/step02.ts
  offset: 4, limit: 4
  snippet:
    4: export function step02(): string {
    5:   const nextStep = step03;
    6:   return \`\${nextStep()}-02\`;
    7: }

step05:
  file: src/indirect-call/lib/step05.ts
  offset: 2, limit: 3
  snippet:
    2: export function step05(): string {
    3:   return "05";
    4: }

step04:
  file: src/indirect-call/utils/step04.ts
  offset: 4, limit: 4
  snippet:
    4: export function step04(): string {
    5:   const nextStep = step05;
    6:   return \`\${nextStep()}-04\`;
    7: }
`);
    });

    it("returns empty for terminal node", () => {
      const output = dependenciesOf(
        db,
        projectRoot,
        "src/indirect-call/lib/step05.ts",
        "step05",
      );

      expect(output).toBe(`No dependencies found.`);
    });
  });

  describe("dependentsOf", () => {
    it("finds all callers of step05 (via variable aliases)", () => {
      const output = dependentsOf(
        db,
        projectRoot,
        "src/indirect-call/lib/step05.ts",
        "step05",
      );

      expect(output).toBe(`## Graph

entry --CALLS--> step02 --CALLS--> step03 --CALLS--> step04 --CALLS--> step05

## Nodes

step03:
  file: src/indirect-call/core/step03.ts
  offset: 4, limit: 4
  snippet:
    4: export function step03(): string {
    5:   const nextStep = step04;
    6:   return \`\${nextStep()}-03\`;
    7: }

entry:
  file: src/indirect-call/entry.ts
  offset: 4, limit: 4
  snippet:
    4: export function entry(): string {
    5:   const nextStep = step02;
    6:   return \`\${nextStep()}-01\`;
    7: }

step02:
  file: src/indirect-call/handlers/step02.ts
  offset: 4, limit: 4
  snippet:
    4: export function step02(): string {
    5:   const nextStep = step03;
    6:   return \`\${nextStep()}-02\`;
    7: }

step04:
  file: src/indirect-call/utils/step04.ts
  offset: 4, limit: 4
  snippet:
    4: export function step04(): string {
    5:   const nextStep = step05;
    6:   return \`\${nextStep()}-04\`;
    7: }
`);
    });

    it("returns empty for entry point", () => {
      const output = dependentsOf(
        db,
        projectRoot,
        "src/indirect-call/entry.ts",
        "entry",
      );

      expect(output).toBe(`No dependents found.`);
    });
  });

  describe("pathsBetween", () => {
    it("finds path from entry to step05", () => {
      const output = pathsBetween(
        db,
        projectRoot,
        { file_path: "src/indirect-call/entry.ts", symbol: "entry" },
        { file_path: "src/indirect-call/lib/step05.ts", symbol: "step05" },
      );

      expect(output).toBe(`## Graph

entry --CALLS--> step02 --CALLS--> step03 --CALLS--> step04 --CALLS--> step05

## Nodes

step03:
  file: src/indirect-call/core/step03.ts
  offset: 4, limit: 4
  snippet:
    4: export function step03(): string {
    5:   const nextStep = step04;
    6:   return \`\${nextStep()}-03\`;
    7: }

step02:
  file: src/indirect-call/handlers/step02.ts
  offset: 4, limit: 4
  snippet:
    4: export function step02(): string {
    5:   const nextStep = step03;
    6:   return \`\${nextStep()}-02\`;
    7: }

step04:
  file: src/indirect-call/utils/step04.ts
  offset: 4, limit: 4
  snippet:
    4: export function step04(): string {
    5:   const nextStep = step05;
    6:   return \`\${nextStep()}-04\`;
    7: }
`);
    });

    it("finds shorter path from midpoint", () => {
      const output = pathsBetween(
        db,
        projectRoot,
        { file_path: "src/indirect-call/core/step03.ts", symbol: "step03" },
        { file_path: "src/indirect-call/lib/step05.ts", symbol: "step05" },
      );

      expect(output).toBe(`## Graph

step03 --CALLS--> step04 --CALLS--> step05

## Nodes

step04:
  file: src/indirect-call/utils/step04.ts
  offset: 4, limit: 4
  snippet:
    4: export function step04(): string {
    5:   const nextStep = step05;
    6:   return \`\${nextStep()}-04\`;
    7: }
`);
    });
  });
});
