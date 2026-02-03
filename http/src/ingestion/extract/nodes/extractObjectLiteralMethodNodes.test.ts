import assert from "node:assert";
import { Project } from "ts-morph";
import { describe, expect, it } from "vitest";
import { extractObjectLiteralMethodNodes } from "./extractObjectLiteralMethodNodes.js";

const createSourceFile = (code: string) => {
  const project = new Project({ useInMemoryFileSystem: true });
  return project.createSourceFile("test.ts", code);
};

const context = { filePath: "test.ts", package: "test-pkg" };

describe("extractObjectLiteralMethodNodes", () => {
  it("extracts method from object literal", () => {
    const sourceFile = createSourceFile(`
      export const userService = {
        login(user: User): boolean {
          return true;
        }
      };
    `);

    const nodes = extractObjectLiteralMethodNodes(sourceFile, context);

    expect(nodes).toHaveLength(1);
    const [method] = nodes;
    assert(method !== undefined);
    expect(method.id).toBe("test.ts:Function:userService.login");
    expect(method.name).toBe("login");
    expect(method.type).toBe("Function");
    expect(method.parameters).toEqual([{ name: "user", type: "User" }]);
    expect(method.returnType).toBe("boolean");
  });

  it("extracts multiple methods from object literal", () => {
    const sourceFile = createSourceFile(`
      export const api = {
        get(url: string): Response { },
        post(url: string, data: Data): Response { }
      };
    `);

    const nodes = extractObjectLiteralMethodNodes(sourceFile, context);

    expect(nodes).toHaveLength(2);
    expect(nodes.map((n) => n.name)).toEqual(["get", "post"]);
    expect(nodes.map((n) => n.id)).toEqual([
      "test.ts:Function:api.get",
      "test.ts:Function:api.post",
    ]);
  });

  it("extracts async methods", () => {
    const sourceFile = createSourceFile(`
      const service = {
        async fetchData(): Promise<Data> { }
      };
    `);

    const nodes = extractObjectLiteralMethodNodes(sourceFile, context);

    expect(nodes).toHaveLength(1);
    const [method] = nodes;
    assert(method !== undefined);
    expect(method.async).toBe(true);
  });

  it("extracts arrow function properties as methods", () => {
    const sourceFile = createSourceFile(`
      export const utils = {
        format: (value: string): string => value.trim()
      };
    `);

    const nodes = extractObjectLiteralMethodNodes(sourceFile, context);

    expect(nodes).toHaveLength(1);
    const [method] = nodes;
    assert(method !== undefined);
    expect(method.id).toBe("test.ts:Function:utils.format");
    expect(method.name).toBe("format");
    expect(method.parameters).toEqual([{ name: "value", type: "string" }]);
    expect(method.returnType).toBe("string");
  });

  it("skips non-function properties", () => {
    const sourceFile = createSourceFile(`
      export const config = {
        name: "app",
        version: 1,
        enabled: true
      };
    `);

    const nodes = extractObjectLiteralMethodNodes(sourceFile, context);

    expect(nodes).toHaveLength(0);
  });

  it("handles nested object literals (top level only)", () => {
    const sourceFile = createSourceFile(`
      export const service = {
        handlers: {
          onSuccess() { }
        },
        process() { }
      };
    `);

    const nodes = extractObjectLiteralMethodNodes(sourceFile, context);

    // Only extracts top-level methods, not nested
    expect(nodes).toHaveLength(1);
    expect(nodes[0]?.name).toBe("process");
  });

  it("sets exported flag based on variable export status", () => {
    const sourceFile = createSourceFile(`
      export const exported = {
        method() { }
      };
      const notExported = {
        method() { }
      };
    `);

    const nodes = extractObjectLiteralMethodNodes(sourceFile, context);

    expect(nodes).toHaveLength(2);
    const exportedMethod = nodes.find(
      (n) => n.id === "test.ts:Function:exported.method",
    );
    const notExportedMethod = nodes.find(
      (n) => n.id === "test.ts:Function:notExported.method",
    );
    assert(exportedMethod !== undefined);
    assert(notExportedMethod !== undefined);
    expect(exportedMethod.exported).toBe(true);
    expect(notExportedMethod.exported).toBe(false);
  });
});
