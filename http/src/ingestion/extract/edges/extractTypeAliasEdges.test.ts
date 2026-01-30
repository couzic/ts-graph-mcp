import { describe, expect, it } from "vitest";
import { Project } from "ts-morph";
import { extractTypeAliasEdges } from "./extractTypeAliasEdges.js";

const createSourceFile = (code: string) => {
  const project = new Project({ useInMemoryFileSystem: true });
  return project.createSourceFile("test.ts", code);
};

const context = { filePath: "test.ts", package: "test-pkg" };

describe("extractTypeAliasEdges", () => {
  describe("ALIAS_FOR edges", () => {
    it("extracts ALIAS_FOR edge for direct type alias", () => {
      const sourceFile = createSourceFile(`
        interface User { name: string }
        type Person = User;
      `);

      const edges = extractTypeAliasEdges(sourceFile, context);

      expect(edges).toHaveLength(1);
      expect(edges[0]).toEqual({
        source: "test.ts:Person",
        target: "test.ts:User",
        type: "ALIAS_FOR",
      });
    });

    it("skips primitive aliases", () => {
      const sourceFile = createSourceFile(`
        type ID = string;
      `);

      const edges = extractTypeAliasEdges(sourceFile, context);

      expect(edges).toHaveLength(0);
    });
  });

  describe("DERIVES_FROM edges (intersection)", () => {
    it("extracts DERIVES_FROM edge for intersection type", () => {
      const sourceFile = createSourceFile(`
        interface User { name: string }
        type Customer = User & { id: string };
      `);

      const edges = extractTypeAliasEdges(sourceFile, context);

      expect(edges).toHaveLength(1);
      expect(edges[0]).toEqual({
        source: "test.ts:Customer",
        target: "test.ts:User",
        type: "DERIVES_FROM",
      });
    });

    it("extracts multiple DERIVES_FROM edges for multiple intersections", () => {
      const sourceFile = createSourceFile(`
        interface Named { name: string }
        interface Identified { id: string }
        type Entity = Named & Identified;
      `);

      const edges = extractTypeAliasEdges(sourceFile, context);

      expect(edges).toHaveLength(2);
      expect(edges.map((e) => e.target)).toContain("test.ts:Named");
      expect(edges.map((e) => e.target)).toContain("test.ts:Identified");
    });
  });

  describe("DERIVES_FROM edges (union)", () => {
    it("extracts DERIVES_FROM edge for union type", () => {
      const sourceFile = createSourceFile(`
        interface Success { data: string }
        interface Failure { error: string }
        type Result = Success | Failure;
      `);

      const edges = extractTypeAliasEdges(sourceFile, context);

      expect(edges).toHaveLength(2);
      expect(edges.map((e) => e.target)).toContain("test.ts:Success");
      expect(edges.map((e) => e.target)).toContain("test.ts:Failure");
    });

    it("skips null and undefined in unions", () => {
      const sourceFile = createSourceFile(`
        interface User { name: string }
        type MaybeUser = User | null | undefined;
      `);

      const edges = extractTypeAliasEdges(sourceFile, context);

      expect(edges).toHaveLength(1);
      expect(edges[0]?.target).toBe("test.ts:User");
    });
  });

  describe("complex cases", () => {
    it("handles nested generics", () => {
      const sourceFile = createSourceFile(`
        interface User { name: string }
        type Users = Array<User>;
      `);

      const edges = extractTypeAliasEdges(sourceFile, context);

      // Array<User> is a generic wrapper - we extract the inner type
      expect(edges).toHaveLength(1);
      expect(edges[0]?.target).toBe("test.ts:User");
      expect(edges[0]?.type).toBe("ALIAS_FOR");
    });

    it("skips mapped types (Partial, Pick, etc.)", () => {
      const sourceFile = createSourceFile(`
        interface User { name: string }
        type PartialUser = Partial<User>;
      `);

      const edges = extractTypeAliasEdges(sourceFile, context);

      // Partial<User> - we extract User from inside the wrapper
      expect(edges).toHaveLength(1);
      expect(edges[0]?.target).toBe("test.ts:User");
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
        type Person = User;
      `,
      );

      const edges = extractTypeAliasEdges(sourceFile, {
        filePath: "test.ts",
        package: "test-pkg",
      });

      expect(edges).toHaveLength(1);
      expect(edges[0]?.target).toBe("types.ts:User");
    });
  });
});
