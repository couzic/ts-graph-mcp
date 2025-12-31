import { Project } from "ts-morph";
import { beforeEach, describe, expect, it } from "vitest";
import { extractVariableNodes } from "./extractVariableNodes.js";
import type { NodeExtractionContext } from "./NodeExtractionContext.js";

describe(extractVariableNodes.name, () => {
  let project: Project;

  beforeEach(() => {
    project = new Project({ useInMemoryFileSystem: true });
  });

  const createContext = (filePath = "src/test.ts"): NodeExtractionContext => ({
    filePath,
    package: "myapp",
  });

  it("extracts const variable with isConst flag", () => {
    const sourceFile = project.createSourceFile(
      "src/test.ts",
      `export const API_KEY: string = "abc123";`,
    );
    const context = createContext();

    const variables = extractVariableNodes(sourceFile, context);

    expect(variables).toHaveLength(1);
    expect(variables[0]).toMatchObject({
      id: "src/test.ts:API_KEY",
      type: "Variable",
      name: "API_KEY",
      package: "myapp",
      filePath: "src/test.ts",
      exported: true,
      variableType: "string",
      isConst: true,
    });
  });

  it("extracts let variable with isConst false", () => {
    const sourceFile = project.createSourceFile(
      "src/test.ts",
      `let counter: number = 0;`,
    );
    const context = createContext();

    const variables = extractVariableNodes(sourceFile, context);

    expect(variables).toHaveLength(1);
    expect(variables[0]?.isConst).toBe(false);
  });

  it("extracts variable without type annotation", () => {
    const sourceFile = project.createSourceFile(
      "src/test.ts",
      `const value = 42;`,
    );
    const context = createContext();

    const variables = extractVariableNodes(sourceFile, context);

    expect(variables).toHaveLength(1);
    expect(variables[0]?.variableType).toBeUndefined();
  });

  it("extracts multiple variables from one statement", () => {
    const sourceFile = project.createSourceFile(
      "src/test.ts",
      `const x = 1, y = 2, z = 3;`,
    );
    const context = createContext();

    const variables = extractVariableNodes(sourceFile, context);

    expect(variables).toHaveLength(3);
    expect(variables.map((v) => v.name)).toEqual(["x", "y", "z"]);
  });

  it("normalizes variableType", () => {
    const sourceFile = project.createSourceFile(
      "src/test.ts",
      `const x: {\n\ta: string;\n} = { a: "" };`,
    );
    const variables = extractVariableNodes(sourceFile, createContext());
    expect(variables[0]?.variableType).not.toMatch(/[\n\t]/);
  });
});
