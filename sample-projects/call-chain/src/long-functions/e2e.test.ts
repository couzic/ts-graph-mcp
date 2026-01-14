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
import { indexProject } from "../../../../http/src/ingestion/indexProject.js";
import { silentLogger } from "../../../../http/src/logging/SilentTsGraphLogger.js";
import { dependenciesOf } from "../../../../http/src/query/dependencies-of/dependenciesOf.js";
import { dependentsOf } from "../../../../http/src/query/dependents-of/dependentsOf.js";
import { pathsBetween } from "../../../../http/src/query/paths-between/pathsBetween.js";

describe("long functions E2E - snippet truncation", () => {
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
    await indexProject(config, writer, { projectRoot, logger: silentLogger });
  });

  afterAll(() => {
    closeDatabase(db);
  });

  describe("dependenciesOf", () => {
    it("truncates step04 snippet to context around call site", () => {
      const output = dependenciesOf(
        db,
        projectRoot,
        "src/long-functions/entry.ts",
        "entry",
      );
      expect(output).toMatchInlineSnapshot(`
        "## Graph

        entry --CALLS--> step02 --CALLS--> step03 --CALLS--> step04 --CALLS--> terminal

        ## Nodes

        step02:
          type: Function
          file: src/long-functions/step02.ts
          offset: 3, limit: 3
          snippet:
            3: export function step02(): string {
          > 4:   return \`\${step03()}-02\`;
            5: }

        step03:
          type: Function
          file: src/long-functions/step03.ts
          offset: 3, limit: 3
          snippet:
            3: export function step03(): string {
          > 4:   return \`\${step04()}-03\`;
            5: }

        step04:
          type: Function
          file: src/long-functions/step04.ts
          offset: 9, limit: 31
          snippet:
            10:   // Line 10
            11:   const a = "setup";
            12: 
            13:   // Line 13
            14:   const b = "more setup";
            15: 
            16:   // Line 16
            17:   const c = "validation";
            18: 
            19:   // Line 19: THE CALL SITE
          > 20:   const result = terminal();
            21: 
            22:   // Line 22
            23:   const d = "post-process";
            24: 
            25:   // Line 25
            26:   const e = "format";
            27: 
            28:   // Line 28
            29:   const f = "cleanup";
            30: 

        terminal:
          type: Function
          file: src/long-functions/terminal.ts
          offset: 1, limit: 3
          snippet:
            1: export function terminal(): string {
            2:   return "end";
            3: }
        "
      `);
    });
  });

  describe("dependentsOf", () => {
    it("truncates step04 snippet to context around call site", () => {
      const output = dependentsOf(
        db,
        projectRoot,
        "src/long-functions/terminal.ts",
        "terminal",
      );
      expect(output).toMatchInlineSnapshot(`
        "## Graph

        entry --CALLS--> step02 --CALLS--> step03 --CALLS--> step04 --CALLS--> terminal

        ## Nodes

        entry:
          type: Function
          file: src/long-functions/entry.ts
          offset: 3, limit: 3
          snippet:
            3: export function entry(): string {
          > 4:   return \`\${step02()}-01\`;
            5: }

        step02:
          type: Function
          file: src/long-functions/step02.ts
          offset: 3, limit: 3
          snippet:
            3: export function step02(): string {
          > 4:   return \`\${step03()}-02\`;
            5: }

        step03:
          type: Function
          file: src/long-functions/step03.ts
          offset: 3, limit: 3
          snippet:
            3: export function step03(): string {
          > 4:   return \`\${step04()}-03\`;
            5: }

        step04:
          type: Function
          file: src/long-functions/step04.ts
          offset: 9, limit: 31
          snippet:
            10:   // Line 10
            11:   const a = "setup";
            12: 
            13:   // Line 13
            14:   const b = "more setup";
            15: 
            16:   // Line 16
            17:   const c = "validation";
            18: 
            19:   // Line 19: THE CALL SITE
          > 20:   const result = terminal();
            21: 
            22:   // Line 22
            23:   const d = "post-process";
            24: 
            25:   // Line 25
            26:   const e = "format";
            27: 
            28:   // Line 28
            29:   const f = "cleanup";
            30: 
        "
      `);
    });
  });

  describe("pathsBetween", () => {
    it("truncates step04 snippet to context around call site", () => {
      const output = pathsBetween(
        db,
        projectRoot,
        { file_path: "src/long-functions/entry.ts", symbol: "entry" },
        { file_path: "src/long-functions/terminal.ts", symbol: "terminal" },
      );
      expect(output).toMatchInlineSnapshot(`
        "## Graph

        entry --CALLS--> step02 --CALLS--> step03 --CALLS--> step04 --CALLS--> terminal

        ## Nodes

        step02:
          type: Function
          file: src/long-functions/step02.ts
          offset: 3, limit: 3
          snippet:
            3: export function step02(): string {
          > 4:   return \`\${step03()}-02\`;
            5: }

        step03:
          type: Function
          file: src/long-functions/step03.ts
          offset: 3, limit: 3
          snippet:
            3: export function step03(): string {
          > 4:   return \`\${step04()}-03\`;
            5: }

        step04:
          type: Function
          file: src/long-functions/step04.ts
          offset: 9, limit: 31
          snippet:
            10:   // Line 10
            11:   const a = "setup";
            12: 
            13:   // Line 13
            14:   const b = "more setup";
            15: 
            16:   // Line 16
            17:   const c = "validation";
            18: 
            19:   // Line 19: THE CALL SITE
          > 20:   const result = terminal();
            21: 
            22:   // Line 22
            23:   const d = "post-process";
            24: 
            25:   // Line 25
            26:   const e = "format";
            27: 
            28:   // Line 28
            29:   const f = "cleanup";
            30: 
        "
      `);
    });
  });
});
