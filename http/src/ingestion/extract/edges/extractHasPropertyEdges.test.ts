import { describe, expect, it } from "vitest";
import { Project } from "ts-morph";
import { extractHasPropertyEdges } from "./extractHasPropertyEdges.js";

const createSourceFile = (code: string) => {
  const project = new Project({ useInMemoryFileSystem: true });
  return project.createSourceFile("test.ts", code);
};

const context = { filePath: "test.ts", package: "test-pkg" };

describe("extractHasPropertyEdges", () => {
  describe("class properties", () => {
    it("extracts HAS_PROPERTY edge for class property", () => {
      const sourceFile = createSourceFile(`
        interface User { name: string }
        class Service {
          user: User;
        }
      `);

      const edges = extractHasPropertyEdges(sourceFile, context);

      expect(edges).toHaveLength(1);
      expect(edges[0]).toEqual({
        source: "test.ts:Service",
        target: "test.ts:User",
        type: "HAS_PROPERTY",
      });
    });

    it("extracts multiple HAS_PROPERTY edges", () => {
      const sourceFile = createSourceFile(`
        interface User { name: string }
        interface Config { timeout: number }
        class Service {
          user: User;
          config: Config;
        }
      `);

      const edges = extractHasPropertyEdges(sourceFile, context);

      expect(edges).toHaveLength(2);
      expect(edges.map((e) => e.target)).toContain("test.ts:User");
      expect(edges.map((e) => e.target)).toContain("test.ts:Config");
    });

    it("skips primitive property types", () => {
      const sourceFile = createSourceFile(`
        class Config {
          name: string;
          count: number;
        }
      `);

      const edges = extractHasPropertyEdges(sourceFile, context);

      expect(edges).toHaveLength(0);
    });
  });

  describe("interface properties", () => {
    it("extracts HAS_PROPERTY edge for interface property", () => {
      const sourceFile = createSourceFile(`
        interface Address { street: string }
        interface User {
          address: Address;
        }
      `);

      const edges = extractHasPropertyEdges(sourceFile, context);

      expect(edges).toHaveLength(1);
      expect(edges[0]).toEqual({
        source: "test.ts:User",
        target: "test.ts:Address",
        type: "HAS_PROPERTY",
      });
    });
  });

  describe("object literal properties", () => {
    it("extracts HAS_PROPERTY edge for typed object property", () => {
      const sourceFile = createSourceFile(`
        interface User { name: string }
        const service = {
          currentUser: null as User | null
        };
      `);

      const edges = extractHasPropertyEdges(sourceFile, context);

      expect(edges).toHaveLength(1);
      expect(edges[0]).toEqual({
        source: "test.ts:service",
        target: "test.ts:User",
        type: "HAS_PROPERTY",
      });
    });

    it("skips method properties (handled by TAKES/RETURNS)", () => {
      const sourceFile = createSourceFile(`
        interface User { name: string }
        const service = {
          load(): User { }
        };
      `);

      const edges = extractHasPropertyEdges(sourceFile, context);

      // Method return types are handled by RETURNS, not HAS_PROPERTY
      expect(edges).toHaveLength(0);
    });
  });

  describe("generics and unions", () => {
    it("extracts inner type from generic wrapper", () => {
      const sourceFile = createSourceFile(`
        interface User { name: string }
        class Service {
          users: Array<User>;
        }
      `);

      const edges = extractHasPropertyEdges(sourceFile, context);

      expect(edges).toHaveLength(1);
      expect(edges[0]?.target).toBe("test.ts:User");
    });

    it("extracts multiple edges for union types", () => {
      const sourceFile = createSourceFile(`
        interface User { name: string }
        interface Admin { role: string }
        class Service {
          actor: User | Admin;
        }
      `);

      const edges = extractHasPropertyEdges(sourceFile, context);

      expect(edges).toHaveLength(2);
      expect(edges.map((e) => e.target)).toContain("test.ts:User");
      expect(edges.map((e) => e.target)).toContain("test.ts:Admin");
    });
  });

  describe("cross-file types", () => {
    it("resolves imported types", () => {
      const project = new Project({ useInMemoryFileSystem: true });
      project.createSourceFile(
        "types.ts",
        `export interface User { name: string }`,
      );
      const sourceFile = project.createSourceFile(
        "test.ts",
        `
        import { User } from './types';
        class Service {
          user: User;
        }
      `,
      );

      const edges = extractHasPropertyEdges(sourceFile, {
        filePath: "test.ts",
        package: "test-pkg",
      });

      expect(edges).toHaveLength(1);
      expect(edges[0]?.target).toBe("types.ts:User");
    });
  });
});
