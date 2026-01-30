import { describe, expect, it } from "vitest";
import { Project } from "ts-morph";
import { extractHasTypeEdges } from "./extractHasTypeEdges.js";

const createSourceFile = (code: string) => {
  const project = new Project({ useInMemoryFileSystem: true });
  return project.createSourceFile("test.ts", code);
};

const context = { filePath: "test.ts", package: "test-pkg" };

describe("extractHasTypeEdges", () => {
  it("extracts HAS_TYPE edge for typed variable", () => {
    const sourceFile = createSourceFile(`
      interface User { name: string }
      const currentUser: User = { name: "Alice" };
    `);

    const edges = extractHasTypeEdges(sourceFile, context);

    expect(edges).toHaveLength(1);
    expect(edges[0]).toEqual({
      source: "test.ts:currentUser",
      target: "test.ts:User",
      type: "HAS_TYPE",
    });
  });

  it("skips variables without type annotation", () => {
    const sourceFile = createSourceFile(`
      const value = 42;
    `);

    const edges = extractHasTypeEdges(sourceFile, context);

    expect(edges).toHaveLength(0);
  });

  it("skips primitive types", () => {
    const sourceFile = createSourceFile(`
      const name: string = "Alice";
      const age: number = 30;
      const active: boolean = true;
    `);

    const edges = extractHasTypeEdges(sourceFile, context);

    expect(edges).toHaveLength(0);
  });

  it("extracts inner type from generic wrapper", () => {
    const sourceFile = createSourceFile(`
      interface User { name: string }
      const users: Array<User> = [];
    `);

    const edges = extractHasTypeEdges(sourceFile, context);

    expect(edges).toHaveLength(1);
    expect(edges[0]?.target).toBe("test.ts:User");
  });

  it("extracts multiple edges for union types", () => {
    const sourceFile = createSourceFile(`
      interface User { name: string }
      interface Admin { role: string }
      const actor: User | Admin = { name: "Alice" };
    `);

    const edges = extractHasTypeEdges(sourceFile, context);

    expect(edges).toHaveLength(2);
    expect(edges.map((e) => e.target)).toContain("test.ts:User");
    expect(edges.map((e) => e.target)).toContain("test.ts:Admin");
  });

  it("skips arrow function variables (handled by TAKES/RETURNS)", () => {
    const sourceFile = createSourceFile(`
      interface User { name: string }
      const loadUser = (id: string): User => ({ name: "Alice" });
    `);

    const edges = extractHasTypeEdges(sourceFile, context);

    // No HAS_TYPE edge - the function's return type is handled by RETURNS
    expect(edges).toHaveLength(0);
  });

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
      const currentUser: User = { name: "Alice" };
    `,
    );

    const edges = extractHasTypeEdges(sourceFile, {
      filePath: "test.ts",
      package: "test-pkg",
    });

    expect(edges).toHaveLength(1);
    expect(edges[0]?.target).toBe("types.ts:User");
  });
});
