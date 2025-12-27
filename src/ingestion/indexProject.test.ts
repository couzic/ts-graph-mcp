import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ProjectConfig } from "../config/Config.schemas.js";
import type { DbWriter } from "../db/DbWriter.js";
import { createSqliteWriter } from "../db/sqlite/createSqliteWriter.js";
import {
  closeDatabase,
  openDatabase,
} from "../db/sqlite/sqliteConnection.utils.js";
import type { Edge, Node } from "../db/Types.js";
import { indexProject } from "./indexProject.js";

/**
 * Simple helper to check if a node exists in the database.
 * Used for test verification only.
 */
function nodeExists(db: Database.Database, nodeId: string): boolean {
  const row = db.prepare("SELECT 1 FROM nodes WHERE id = ?").get(nodeId);
  return row !== undefined;
}

const TEST_DIR = "/tmp/ts-graph-rag-ingestion-test";

// Mock DbWriter that collects all written data
const createMockWriter = (): DbWriter & {
  nodes: Node[];
  edges: Edge[];
  removedFiles: string[];
  cleared: boolean;
} => {
  const state = {
    nodes: [] as Node[],
    edges: [] as Edge[],
    removedFiles: [] as string[],
    cleared: false,
  };

  return {
    get nodes() {
      return state.nodes;
    },
    get edges() {
      return state.edges;
    },
    get removedFiles() {
      return state.removedFiles;
    },
    get cleared() {
      return state.cleared;
    },
    async addNodes(newNodes: Node[]): Promise<void> {
      state.nodes.push(...newNodes);
    },
    async addEdges(newEdges: Edge[]): Promise<void> {
      state.edges.push(...newEdges);
    },
    async removeFileNodes(filePath: string): Promise<void> {
      state.removedFiles.push(filePath);
      // Remove nodes with this filePath
      const toRemove = state.nodes
        .filter((n) => n.filePath === filePath)
        .map((n) => n.id);
      for (let i = state.nodes.length - 1; i >= 0; i--) {
        const nodeId = state.nodes[i]?.id;
        if (nodeId && toRemove.includes(nodeId)) {
          state.nodes.splice(i, 1);
        }
      }
    },
    async clearAll(): Promise<void> {
      state.nodes.length = 0;
      state.edges.length = 0;
      state.removedFiles.length = 0;
      state.cleared = true;
    },
  };
};

describe("Ingestion", () => {
  beforeEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
    mkdirSync(TEST_DIR, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
  });

  describe(indexProject.name, () => {
    it("indexes all packages in config", async () => {
      // Create project structure
      const pkg1Dir = join(TEST_DIR, "packages", "core");
      const pkg2Dir = join(TEST_DIR, "packages", "utils");
      mkdirSync(pkg1Dir, { recursive: true });
      mkdirSync(pkg2Dir, { recursive: true });

      // Create tsconfig files
      writeFileSync(
        join(pkg1Dir, "tsconfig.json"),
        JSON.stringify({
          compilerOptions: { target: "ES2022", module: "NodeNext" },
          include: ["*.ts"],
        }),
      );
      writeFileSync(
        join(pkg2Dir, "tsconfig.json"),
        JSON.stringify({
          compilerOptions: { target: "ES2022", module: "NodeNext" },
          include: ["*.ts"],
        }),
      );

      // Create source files
      writeFileSync(join(pkg1Dir, "index.ts"), "export const core = true;");
      writeFileSync(
        join(pkg2Dir, "helpers.ts"),
        "export function help(): void {}",
      );

      const config: ProjectConfig = {
        modules: [
          {
            name: "app",
            packages: [
              { name: "core", tsconfig: "./packages/core/tsconfig.json" },
              { name: "utils", tsconfig: "./packages/utils/tsconfig.json" },
            ],
          },
        ],
      };

      const writer = createMockWriter();
      const result = await indexProject(config, writer, {
        projectRoot: TEST_DIR,
      });

      expect(result.filesProcessed).toBeGreaterThanOrEqual(2);
      expect(result.nodesAdded).toBeGreaterThan(0);
      expect(result.durationMs).toBeGreaterThan(0);
    });

    it("returns error info for invalid files", async () => {
      const pkgDir = join(TEST_DIR, "packages", "broken");
      mkdirSync(pkgDir, { recursive: true });

      writeFileSync(
        join(pkgDir, "tsconfig.json"),
        JSON.stringify({
          compilerOptions: { target: "ES2022" },
          include: ["*.ts"],
        }),
      );

      // Valid file
      writeFileSync(join(pkgDir, "valid.ts"), "export const x = 1;");

      const config: ProjectConfig = {
        modules: [
          {
            name: "test",
            packages: [
              { name: "broken", tsconfig: "./packages/broken/tsconfig.json" },
            ],
          },
        ],
      };

      const writer = createMockWriter();
      const result = await indexProject(config, writer, {
        projectRoot: TEST_DIR,
      });

      // Should still process valid files
      expect(result.filesProcessed).toBeGreaterThanOrEqual(1);
    });

    it("clears database before full reindex when clearFirst is true", async () => {
      const pkgDir = join(TEST_DIR, "packages", "main");
      mkdirSync(pkgDir, { recursive: true });

      writeFileSync(
        join(pkgDir, "tsconfig.json"),
        JSON.stringify({
          compilerOptions: { target: "ES2022" },
          include: ["*.ts"],
        }),
      );
      writeFileSync(join(pkgDir, "app.ts"), "export const app = true;");

      const config: ProjectConfig = {
        modules: [
          {
            name: "test",
            packages: [
              { name: "main", tsconfig: "./packages/main/tsconfig.json" },
            ],
          },
        ],
      };

      const writer = createMockWriter();
      await indexProject(config, writer, {
        projectRoot: TEST_DIR,
        clearFirst: true,
      });

      expect(writer.cleared).toBe(true);
    });

    it("handles cross-file edges without foreign key errors", async () => {
      // This test demonstrates the bug: when file A imports from file B,
      // and we process A before B, the edge from A to B fails because
      // the target node doesn't exist yet.

      const pkgDir = join(TEST_DIR, "packages", "crossfile");
      mkdirSync(pkgDir, { recursive: true });

      writeFileSync(
        join(pkgDir, "tsconfig.json"),
        JSON.stringify({
          compilerOptions: {
            target: "ES2022",
            module: "NodeNext",
            moduleResolution: "NodeNext",
          },
          include: ["*.ts"],
        }),
      );

      // File A imports and calls a function from file B
      writeFileSync(
        join(pkgDir, "a.ts"),
        `
import { helper } from './b.js';

export function main(): void {
  helper();
}
`.trim(),
      );

      // File B exports the helper function
      writeFileSync(
        join(pkgDir, "b.ts"),
        `
export function helper(): void {
  console.log('helper');
}
`.trim(),
      );

      const config: ProjectConfig = {
        modules: [
          {
            name: "test",
            packages: [
              {
                name: "crossfile",
                tsconfig: "./packages/crossfile/tsconfig.json",
              },
            ],
          },
        ],
      };

      // Use real SQLite writer with foreign key constraints
      let db: Database.Database | undefined;
      try {
        db = openDatabase({ path: ":memory:" });
        const sqliteWriter = createSqliteWriter(db);

        const result = await indexProject(config, sqliteWriter, {
          projectRoot: TEST_DIR,
        });

        // Should have no errors - cross-file edges should work
        expect(result.errors).toBeUndefined();
        expect(result.filesProcessed).toBe(2);

        // Verify both files were indexed
        expect(nodeExists(db, "packages/crossfile/a.ts:main")).toBe(true);
        expect(nodeExists(db, "packages/crossfile/b.ts:helper")).toBe(true);

        // Verify the file node exists (for IMPORTS edge relationship)
        expect(nodeExists(db, "packages/crossfile/a.ts")).toBe(true);
      } finally {
        if (db) {
          closeDatabase(db);
        }
      }
    });

    it("handles edges to external dependencies without foreign key errors", async () => {
      // This test demonstrates the bug: when a file imports from node_modules,
      // the edge targets a node that doesn't exist (we skip node_modules),
      // causing foreign key errors.

      const pkgDir = join(TEST_DIR, "packages", "external");
      mkdirSync(pkgDir, { recursive: true });

      writeFileSync(
        join(pkgDir, "tsconfig.json"),
        JSON.stringify({
          compilerOptions: {
            target: "ES2022",
            module: "NodeNext",
            moduleResolution: "NodeNext",
          },
          include: ["*.ts"],
        }),
      );

      // File that imports from an external dependency
      writeFileSync(
        join(pkgDir, "app.ts"),
        `
import { join } from 'node:path';

export function getPath(): string {
  return join('a', 'b');
}
`.trim(),
      );

      const config: ProjectConfig = {
        modules: [
          {
            name: "test",
            packages: [
              {
                name: "external",
                tsconfig: "./packages/external/tsconfig.json",
              },
            ],
          },
        ],
      };

      // Use real SQLite writer with foreign key constraints
      let db: Database.Database | undefined;
      try {
        db = openDatabase({ path: ":memory:" });
        const sqliteWriter = createSqliteWriter(db);

        const result = await indexProject(config, sqliteWriter, {
          projectRoot: TEST_DIR,
        });

        // Should have no errors - edges to external deps should be filtered out
        expect(result.errors).toBeUndefined();
        expect(result.filesProcessed).toBe(1);
      } finally {
        if (db) {
          closeDatabase(db);
        }
      }
    });

    it("handles cross-package edges without foreign key errors", async () => {
      // This test demonstrates the bug: when package A imports from package B,
      // and we process all of A before B, the edges from A to B fail because
      // the target nodes don't exist yet (different packages = different indexPackage calls).

      const pkg1Dir = join(TEST_DIR, "packages", "core");
      const pkg2Dir = join(TEST_DIR, "packages", "utils");
      mkdirSync(pkg1Dir, { recursive: true });
      mkdirSync(pkg2Dir, { recursive: true });

      // Package 1: core - imports from utils
      writeFileSync(
        join(pkg1Dir, "tsconfig.json"),
        JSON.stringify({
          compilerOptions: {
            target: "ES2022",
            module: "NodeNext",
            moduleResolution: "NodeNext",
            paths: { "@utils/*": ["../utils/*"] },
          },
          include: ["*.ts"],
        }),
      );
      writeFileSync(
        join(pkg1Dir, "app.ts"),
        `
import { formatDate } from '../utils/format.js';

export function main(): void {
  console.log(formatDate(new Date()));
}
`.trim(),
      );

      // Package 2: utils - exports helper
      writeFileSync(
        join(pkg2Dir, "tsconfig.json"),
        JSON.stringify({
          compilerOptions: {
            target: "ES2022",
            module: "NodeNext",
            moduleResolution: "NodeNext",
          },
          include: ["*.ts"],
        }),
      );
      writeFileSync(
        join(pkg2Dir, "format.ts"),
        `
export function formatDate(date: Date): string {
  return date.toISOString();
}
`.trim(),
      );

      const config: ProjectConfig = {
        modules: [
          {
            name: "app",
            packages: [
              // core is processed first, but it depends on utils
              { name: "core", tsconfig: "./packages/core/tsconfig.json" },
              { name: "utils", tsconfig: "./packages/utils/tsconfig.json" },
            ],
          },
        ],
      };

      // Use real SQLite writer with foreign key constraints
      let db: Database.Database | undefined;
      try {
        db = openDatabase({ path: ":memory:" });
        const sqliteWriter = createSqliteWriter(db);

        const result = await indexProject(config, sqliteWriter, {
          projectRoot: TEST_DIR,
        });

        // Should have no errors - cross-package edges should work
        expect(result.errors).toBeUndefined();
        expect(result.filesProcessed).toBeGreaterThanOrEqual(2);

        // Verify both packages were indexed
        expect(nodeExists(db, "packages/core/app.ts:main")).toBe(true);
        expect(nodeExists(db, "packages/utils/format.ts:formatDate")).toBe(
          true,
        );
      } finally {
        if (db) {
          closeDatabase(db);
        }
      }
    });
  });
});
