import { join } from "node:path";
import type { Database } from "better-sqlite3";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { ProjectConfig } from "../../../../http/src/config/Config.schemas.js";
import { createSqliteWriter } from "../../../../http/src/db/sqlite/createSqliteWriter.js";
import {
  closeDatabase,
  openDatabase,
} from "../../../../http/src/db/sqlite/sqliteConnection.utils.js";
import { initializeSchema } from "../../../../http/src/db/sqlite/sqliteSchema.utils.js";
import { createFakeEmbeddingProvider } from "../../../../http/src/embedding/createFakeEmbeddingProvider.js";
import { indexProject } from "../../../../http/src/ingestion/indexProject.js";
import { silentLogger } from "../../../../http/src/logging/SilentTsGraphLogger.js";
import { dependenciesOf } from "../../../../http/src/query/dependencies-of/dependenciesOf.js";
import { dependentsOf } from "../../../../http/src/query/dependents-of/dependentsOf.js";
import { pathsBetween } from "../../../../http/src/query/paths-between/pathsBetween.js";

/**
 * E2E tests for call-chain sample project.
 *
 * Chain: entry → step02 → step03 → step04 → step05
 * Files scattered across subfolders: handlers/, core/, utils/, lib/
 *
 * Tests the 3 core tools by asserting on exact formatted output.
 */
describe("direct call chain E2E tests", () => {
  let db: Database;
  let projectRoot: string;

  beforeAll(async () => {
    db = openDatabase({ path: ":memory:" });
    initializeSchema(db);

    projectRoot = join(import.meta.dirname, "../..");
    const config: ProjectConfig = {
      packages: [{ name: "main", tsconfig: "tsconfig.json" }],
    };
    const writer = createSqliteWriter(db);
    const embeddingProvider = createFakeEmbeddingProvider({ dimensions: 3 });
    await indexProject(config, writer, {
      projectRoot,
      logger: silentLogger,
      embeddingProvider,
    });
  });

  afterAll(() => {
    closeDatabase(db);
  });

  describe("dependenciesOf", () => {
    it("finds all callees of entry", () => {
      const output = dependenciesOf(db, "src/direct-call/entry.ts", "entry");

      expect(output).toBe(
        `
## Graph

entry --CALLS--> step02 --CALLS--> step03 --CALLS--> step04 --CALLS--> step05

## Nodes

step02:
  type: Function
  file: src/direct-call/handlers/step02.ts
  offset: 3, limit: 3
  snippet:
    3: export function step02(): string {
  > 4:   return \`\${step03()}-02\`;
    5: }

step03:
  type: Function
  file: src/direct-call/core/step03.ts
  offset: 3, limit: 3
  snippet:
    3: export function step03(): string {
  > 4:   return \`\${step04()}-03\`;
    5: }

step04:
  type: Function
  file: src/direct-call/utils/step04.ts
  offset: 3, limit: 3
  snippet:
    3: export function step04(): string {
  > 4:   return \`\${step05()}-04\`;
    5: }

step05:
  type: Function
  file: src/direct-call/lib/step05.ts
  offset: 1, limit: 3
  snippet:
    1: export function step05(): string {
    2:   return "05";
    3: }
`.trimStart(),
      );
    });

    it("returns empty for terminal node", () => {
      const output = dependenciesOf(
        db,
        "src/direct-call/lib/step05.ts",
        "step05",
      );

      expect(output).toBe(`No dependencies found.`);
    });
  });

  describe("dependentsOf", () => {
    it("finds all callers of step05", () => {
      const output = dependentsOf(
        db,
        "src/direct-call/lib/step05.ts",
        "step05",
      );

      expect(output).toBe(
        `
## Graph

entry --CALLS--> step02 --CALLS--> step03 --CALLS--> step04 --CALLS--> step05

## Nodes

entry:
  type: Function
  file: src/direct-call/entry.ts
  offset: 3, limit: 3
  snippet:
    3: export function entry(): string {
  > 4:   return \`\${step02()}-01\`;
    5: }

step02:
  type: Function
  file: src/direct-call/handlers/step02.ts
  offset: 3, limit: 3
  snippet:
    3: export function step02(): string {
  > 4:   return \`\${step03()}-02\`;
    5: }

step03:
  type: Function
  file: src/direct-call/core/step03.ts
  offset: 3, limit: 3
  snippet:
    3: export function step03(): string {
  > 4:   return \`\${step04()}-03\`;
    5: }

step04:
  type: Function
  file: src/direct-call/utils/step04.ts
  offset: 3, limit: 3
  snippet:
    3: export function step04(): string {
  > 4:   return \`\${step05()}-04\`;
    5: }
`.trimStart(),
      );
    });

    it("returns empty for entry point", () => {
      const output = dependentsOf(db, "src/direct-call/entry.ts", "entry");

      expect(output).toBe(`No dependents found.`);
    });
  });

  describe("pathsBetween", () => {
    it("finds path from entry to step05", () => {
      const output = pathsBetween(
        db,
        { file_path: "src/direct-call/entry.ts", symbol: "entry" },
        { file_path: "src/direct-call/lib/step05.ts", symbol: "step05" },
      );

      expect(output).toBe(
        `
## Graph

entry --CALLS--> step02 --CALLS--> step03 --CALLS--> step04 --CALLS--> step05

## Nodes

step02:
  type: Function
  file: src/direct-call/handlers/step02.ts
  offset: 3, limit: 3
  snippet:
    3: export function step02(): string {
  > 4:   return \`\${step03()}-02\`;
    5: }

step03:
  type: Function
  file: src/direct-call/core/step03.ts
  offset: 3, limit: 3
  snippet:
    3: export function step03(): string {
  > 4:   return \`\${step04()}-03\`;
    5: }

step04:
  type: Function
  file: src/direct-call/utils/step04.ts
  offset: 3, limit: 3
  snippet:
    3: export function step04(): string {
  > 4:   return \`\${step05()}-04\`;
    5: }
`.trimStart(),
      );
    });

    it("finds shorter path from midpoint", () => {
      const output = pathsBetween(
        db,
        { file_path: "src/direct-call/core/step03.ts", symbol: "step03" },
        { file_path: "src/direct-call/lib/step05.ts", symbol: "step05" },
      );

      expect(output).toBe(
        `
## Graph

step03 --CALLS--> step04 --CALLS--> step05

## Nodes

step04:
  type: Function
  file: src/direct-call/utils/step04.ts
  offset: 3, limit: 3
  snippet:
    3: export function step04(): string {
  > 4:   return \`\${step05()}-04\`;
    5: }
`.trimStart(),
      );
    });

    it("finds path regardless of query direction", () => {
      // Query is step05 → entry, but actual path is entry → step05
      // Bidirectional search finds the path; arrows show actual direction
      const output = pathsBetween(
        db,
        { file_path: "src/direct-call/lib/step05.ts", symbol: "step05" },
        { file_path: "src/direct-call/entry.ts", symbol: "entry" },
      );

      expect(output).toBe(
        `
## Graph

entry --CALLS--> step02 --CALLS--> step03 --CALLS--> step04 --CALLS--> step05

## Nodes

step02:
  type: Function
  file: src/direct-call/handlers/step02.ts
  offset: 3, limit: 3
  snippet:
    3: export function step02(): string {
  > 4:   return \`\${step03()}-02\`;
    5: }

step03:
  type: Function
  file: src/direct-call/core/step03.ts
  offset: 3, limit: 3
  snippet:
    3: export function step03(): string {
  > 4:   return \`\${step04()}-03\`;
    5: }

step04:
  type: Function
  file: src/direct-call/utils/step04.ts
  offset: 3, limit: 3
  snippet:
    3: export function step04(): string {
  > 4:   return \`\${step05()}-04\`;
    5: }
`.trimStart(),
      );
    });

    it("returns error for same node", () => {
      const output = pathsBetween(
        db,
        { file_path: "src/direct-call/core/step03.ts", symbol: "step03" },
        { file_path: "src/direct-call/core/step03.ts", symbol: "step03" },
      );

      expect(output).toBe(
        `Invalid query: source and target are the same symbol.`,
      );
    });
  });
});
