import { Project } from "ts-morph";
import { beforeEach, describe, expect, it } from "vitest";
import { extractFunctionNodes } from "./extractFunctionNodes.js";
import type { NodeExtractionContext } from "./NodeExtractionContext.js";

describe.skip(extractFunctionNodes.name, () => {
  let project: Project;

  beforeEach(() => {
    project = new Project({ useInMemoryFileSystem: true });
  });

  const createContext = (filePath = "src/test.ts"): NodeExtractionContext => ({
    filePath,
    module: "core",
    package: "myapp",
  });

  it("extracts top-level function with parameters and return type", () => {
    const sourceFile = project.createSourceFile(
      "src/test.ts",
      `export function formatDate(date: Date, format: string): string {
  return "";
}`,
    );
    const context = createContext();

    const functions = extractFunctionNodes(sourceFile, context);

    expect(functions).toHaveLength(1);
    expect(functions[0]).toMatchObject({
      id: "src/test.ts:formatDate",
      type: "Function",
      name: "formatDate",
      module: "core",
      package: "myapp",
      filePath: "src/test.ts",
      startLine: 1,
      endLine: 3,
      exported: true,
      parameters: [
        { name: "date", type: "Date" },
        { name: "format", type: "string" },
      ],
      returnType: "string",
      async: false,
    });
  });

  it("extracts async function with async flag", () => {
    const sourceFile = project.createSourceFile(
      "src/test.ts",
      `export async function fetchData(): Promise<void> {
  await fetch('url');
}`,
    );
    const context = createContext();

    const functions = extractFunctionNodes(sourceFile, context);

    expect(functions).toHaveLength(1);
    expect(functions[0]?.async).toBe(true);
    expect(functions[0]?.returnType).toBe("Promise<void>");
  });

  it("extracts non-exported function", () => {
    const sourceFile = project.createSourceFile(
      "src/test.ts",
      `function helper() {}`,
    );
    const context = createContext();

    const functions = extractFunctionNodes(sourceFile, context);

    expect(functions).toHaveLength(1);
    expect(functions[0]?.exported).toBe(false);
  });

  it("extracts function without explicit return type", () => {
    const sourceFile = project.createSourceFile(
      "src/test.ts",
      `function calculate(x: number) {
  return x * 2;
}`,
    );
    const context = createContext();

    const functions = extractFunctionNodes(sourceFile, context);

    expect(functions).toHaveLength(1);
    expect(functions[0]?.returnType).toBeUndefined();
  });

  it("extracts function with no parameters", () => {
    const sourceFile = project.createSourceFile(
      "src/test.ts",
      `function noParams(): void {}`,
    );
    const context = createContext();

    const functions = extractFunctionNodes(sourceFile, context);

    expect(functions).toHaveLength(1);
    expect(functions[0]?.parameters).toEqual([]);
  });

  it("normalizes parameter and return types", () => {
    const sourceFile = project.createSourceFile(
      "src/test.ts",
      `function fn(x: {\n\ta: string;\n}): {\n\tb: number;\n} { return { b: 1 }; }`,
    );
    const functions = extractFunctionNodes(sourceFile, createContext());
    expect(functions[0]?.parameters?.[0]?.type).not.toMatch(/[\n\t]/);
    expect(functions[0]?.returnType).not.toMatch(/[\n\t]/);
  });
});
