import { Project } from "ts-morph";
import { beforeEach, describe, expect, it } from "vitest";
import { extractArrowFunctionNodes } from "./extractArrowFunctionNodes.js";
import type { NodeExtractionContext } from "./NodeExtractionContext.js";

describe(extractArrowFunctionNodes.name, () => {
  let project: Project;

  beforeEach(() => {
    project = new Project({ useInMemoryFileSystem: true });
  });

  const createContext = (filePath = "src/test.ts"): NodeExtractionContext => ({
    filePath,
    package: "myapp",
  });

  it("extracts arrow function with parameters and return type", () => {
    const sourceFile = project.createSourceFile(
      "src/test.ts",
      `export const handler = (req: Request, res: Response): void => {
  res.send("OK");
};`,
    );
    const context = createContext();

    const functions = extractArrowFunctionNodes(sourceFile, context);

    expect(functions).toHaveLength(1);
    expect(functions[0]).toMatchObject({
      id: "src/test.ts:Function:handler",
      type: "Function",
      name: "handler",
      package: "myapp",
      filePath: "src/test.ts",
      exported: true,
      parameters: [
        { name: "req", type: "Request" },
        { name: "res", type: "Response" },
      ],
      returnType: "void",
      async: false,
    });
  });

  it("extracts async arrow function", () => {
    const sourceFile = project.createSourceFile(
      "src/test.ts",
      `export const fetchData = async (url: string): Promise<Response> => {
  return fetch(url);
};`,
    );
    const context = createContext();

    const functions = extractArrowFunctionNodes(sourceFile, context);

    expect(functions).toHaveLength(1);
    expect(functions[0]?.async).toBe(true);
    expect(functions[0]?.returnType).toBe("Promise<Response>");
  });

  it("extracts function expression", () => {
    const sourceFile = project.createSourceFile(
      "src/test.ts",
      `export const formatter = function(value: string): string {
  return value.trim();
};`,
    );
    const context = createContext();

    const functions = extractArrowFunctionNodes(sourceFile, context);

    expect(functions).toHaveLength(1);
    expect(functions[0]).toMatchObject({
      id: "src/test.ts:Function:formatter",
      type: "Function",
      name: "formatter",
      parameters: [{ name: "value", type: "string" }],
      returnType: "string",
    });
  });

  it("extracts arrow function without explicit return type", () => {
    const sourceFile = project.createSourceFile(
      "src/test.ts",
      `const double = (x: number) => x * 2;`,
    );
    const context = createContext();

    const functions = extractArrowFunctionNodes(sourceFile, context);

    expect(functions).toHaveLength(1);
    expect(functions[0]?.returnType).toBeUndefined();
    expect(functions[0]?.exported).toBe(false);
  });

  it("extracts arrow function with no parameters", () => {
    const sourceFile = project.createSourceFile(
      "src/test.ts",
      `const noop = (): void => {};`,
    );
    const context = createContext();

    const functions = extractArrowFunctionNodes(sourceFile, context);

    expect(functions).toHaveLength(1);
    expect(functions[0]?.parameters).toEqual([]);
  });

  it("ignores non-callable variables", () => {
    const sourceFile = project.createSourceFile(
      "src/test.ts",
      `const value = 42;
const name = "test";
const obj = { a: 1 };`,
    );
    const context = createContext();

    const functions = extractArrowFunctionNodes(sourceFile, context);

    expect(functions).toHaveLength(0);
  });

  it("extracts default-exported arrow function", () => {
    const sourceFile = project.createSourceFile(
      "src/test.ts",
      `const Component = () => {};
export default Component;`,
    );
    const context = createContext();

    const functions = extractArrowFunctionNodes(sourceFile, context);

    expect(functions).toHaveLength(1);
    expect(functions[0]?.exported).toBe(true);
    expect(functions[0]?.name).toBe("Component");
  });

  it("extracts multiple arrow functions from same file", () => {
    const sourceFile = project.createSourceFile(
      "src/test.ts",
      `export const add = (a: number, b: number) => a + b;
export const subtract = (a: number, b: number) => a - b;`,
    );
    const context = createContext();

    const functions = extractArrowFunctionNodes(sourceFile, context);

    expect(functions).toHaveLength(2);
    expect(functions[0]?.name).toBe("add");
    expect(functions[1]?.name).toBe("subtract");
  });
});
