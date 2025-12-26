import { Project } from "ts-morph";
import { beforeEach, describe, expect, it } from "vitest";
import { extractFileNode } from "./extractFileNode.js";
import type { NodeExtractionContext } from "./NodeExtractionContext.js";

describe.skip(extractFileNode.name, () => {
  let project: Project;

  beforeEach(() => {
    project = new Project({ useInMemoryFileSystem: true });
  });

  const createContext = (filePath = "src/test.ts"): NodeExtractionContext => ({
    filePath,
    module: "core",
    package: "myapp",
  });

  it("extracts file node with correct properties", () => {
    const sourceFile = project.createSourceFile(
      "src/utils.ts",
      `export const foo = 1;`,
    );
    const context = createContext("src/utils.ts");

    const fileNode = extractFileNode(sourceFile, context);

    expect(fileNode).toMatchObject({
      id: "src/utils.ts",
      type: "File",
      name: "utils.ts",
      module: "core",
      package: "myapp",
      filePath: "src/utils.ts",
      startLine: 1,
      exported: false,
      extension: ".ts",
    });
  });

  it("extracts tsx file with correct extension", () => {
    const sourceFile = project.createSourceFile(
      "src/Component.tsx",
      `export const Component = () => <div />;`,
    );
    const context = createContext("src/Component.tsx");

    const fileNode = extractFileNode(sourceFile, context);

    expect(fileNode.extension).toBe(".tsx");
    expect(fileNode.name).toBe("Component.tsx");
  });
});
