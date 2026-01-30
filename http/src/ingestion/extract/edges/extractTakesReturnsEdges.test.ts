import assert from "node:assert";
import { describe, expect, it } from "vitest";
import { Project } from "ts-morph";
import { extractTakesReturnsEdges } from "./extractTakesReturnsEdges.js";

const createSourceFile = (code: string) => {
  const project = new Project({ useInMemoryFileSystem: true });
  return project.createSourceFile("test.ts", code);
};

const context = { filePath: "test.ts", package: "test-pkg" };

describe("extractTakesReturnsEdges", () => {
  describe("TAKES edges", () => {
    it("extracts TAKES edge for function parameter", () => {
      const sourceFile = createSourceFile(`
        interface User { name: string }
        function login(user: User): void { }
      `);

      const edges = extractTakesReturnsEdges(sourceFile, context);

      const takesEdges = edges.filter((e) => e.type === "TAKES");
      expect(takesEdges).toHaveLength(1);
      expect(takesEdges[0]).toEqual({
        source: "test.ts:login",
        target: "test.ts:User",
        type: "TAKES",
      });
    });

    it("extracts multiple TAKES edges for multiple parameters", () => {
      const sourceFile = createSourceFile(`
        interface User { name: string }
        interface Config { timeout: number }
        function process(user: User, config: Config): void { }
      `);

      const edges = extractTakesReturnsEdges(sourceFile, context);

      const takesEdges = edges.filter((e) => e.type === "TAKES");
      expect(takesEdges).toHaveLength(2);
      expect(takesEdges.map((e) => e.target)).toContain("test.ts:User");
      expect(takesEdges.map((e) => e.target)).toContain("test.ts:Config");
    });

    it("skips primitive parameter types", () => {
      const sourceFile = createSourceFile(`
        function format(value: string, count: number): void { }
      `);

      const edges = extractTakesReturnsEdges(sourceFile, context);

      expect(edges.filter((e) => e.type === "TAKES")).toHaveLength(0);
    });

    it("extracts inner type from generic wrapper", () => {
      const sourceFile = createSourceFile(`
        interface User { name: string }
        function loadUsers(): Promise<User[]> { }
      `);

      const edges = extractTakesReturnsEdges(sourceFile, context);

      const returnsEdges = edges.filter((e) => e.type === "RETURNS");
      expect(returnsEdges).toHaveLength(1);
      expect(returnsEdges[0]?.target).toBe("test.ts:User");
    });

    it("extracts multiple edges for union types", () => {
      const sourceFile = createSourceFile(`
        interface User { name: string }
        interface Admin { role: string }
        function process(actor: User | Admin): void { }
      `);

      const edges = extractTakesReturnsEdges(sourceFile, context);

      const takesEdges = edges.filter((e) => e.type === "TAKES");
      expect(takesEdges).toHaveLength(2);
      expect(takesEdges.map((e) => e.target)).toContain("test.ts:User");
      expect(takesEdges.map((e) => e.target)).toContain("test.ts:Admin");
    });

    it("skips null and undefined in unions", () => {
      const sourceFile = createSourceFile(`
        interface User { name: string }
        function find(id: string): User | null | undefined { }
      `);

      const edges = extractTakesReturnsEdges(sourceFile, context);

      const returnsEdges = edges.filter((e) => e.type === "RETURNS");
      expect(returnsEdges).toHaveLength(1);
      expect(returnsEdges[0]?.target).toBe("test.ts:User");
    });
  });

  describe("RETURNS edges", () => {
    it("extracts RETURNS edge for function return type", () => {
      const sourceFile = createSourceFile(`
        interface User { name: string }
        function loadUser(): User { }
      `);

      const edges = extractTakesReturnsEdges(sourceFile, context);

      const returnsEdges = edges.filter((e) => e.type === "RETURNS");
      expect(returnsEdges).toHaveLength(1);
      expect(returnsEdges[0]).toEqual({
        source: "test.ts:loadUser",
        target: "test.ts:User",
        type: "RETURNS",
      });
    });

    it("skips void return type", () => {
      const sourceFile = createSourceFile(`
        function doSomething(): void { }
      `);

      const edges = extractTakesReturnsEdges(sourceFile, context);

      expect(edges.filter((e) => e.type === "RETURNS")).toHaveLength(0);
    });
  });

  describe("arrow functions", () => {
    it("extracts TAKES/RETURNS from arrow functions", () => {
      const sourceFile = createSourceFile(`
        interface Input { data: string }
        interface Output { result: string }
        const transform = (input: Input): Output => ({ result: input.data });
      `);

      const edges = extractTakesReturnsEdges(sourceFile, context);

      expect(edges).toHaveLength(2);
      expect(edges.find((e) => e.type === "TAKES")?.target).toBe("test.ts:Input");
      expect(edges.find((e) => e.type === "RETURNS")?.target).toBe("test.ts:Output");
    });
  });

  describe("methods", () => {
    it("extracts TAKES/RETURNS from class methods", () => {
      const sourceFile = createSourceFile(`
        interface User { name: string }
        class UserService {
          save(user: User): User {
            return user;
          }
        }
      `);

      const edges = extractTakesReturnsEdges(sourceFile, context);

      const takesEdges = edges.filter((e) => e.type === "TAKES");
      const returnsEdges = edges.filter((e) => e.type === "RETURNS");
      expect(takesEdges).toHaveLength(1);
      expect(takesEdges[0]?.source).toBe("test.ts:UserService.save");
      expect(returnsEdges).toHaveLength(1);
      expect(returnsEdges[0]?.source).toBe("test.ts:UserService.save");
    });
  });

  describe("object literal methods", () => {
    it("extracts TAKES/RETURNS from object literal methods", () => {
      const sourceFile = createSourceFile(`
        interface User { name: string }
        const userService = {
          load(id: string): User { },
          save(user: User): void { }
        };
      `);

      const edges = extractTakesReturnsEdges(sourceFile, context);

      const takesEdges = edges.filter((e) => e.type === "TAKES");
      const returnsEdges = edges.filter((e) => e.type === "RETURNS");
      expect(takesEdges).toHaveLength(1);
      expect(takesEdges[0]?.source).toBe("test.ts:userService.save");
      expect(returnsEdges).toHaveLength(1);
      expect(returnsEdges[0]?.source).toBe("test.ts:userService.load");
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
        function login(user: User): void { }
      `,
      );

      const edges = extractTakesReturnsEdges(sourceFile, {
        filePath: "test.ts",
        package: "test-pkg",
      });

      const takesEdges = edges.filter((e) => e.type === "TAKES");
      expect(takesEdges).toHaveLength(1);
      expect(takesEdges[0]?.target).toBe("types.ts:User");
    });
  });
});
