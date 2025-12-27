import type { ClassDeclaration, InterfaceDeclaration } from "ts-morph";
import { Project } from "ts-morph";
import { beforeEach, describe, expect, it } from "vitest";
import { extractPropertyNodes } from "./extractPropertyNodes.js";
import type { NodeExtractionContext } from "./NodeExtractionContext.js";

const getFirstClass = (classes: ClassDeclaration[]): ClassDeclaration => {
  const first = classes[0];
  if (!first) throw new Error("Expected at least one class");
  return first;
};

const getFirstInterface = (
  interfaces: InterfaceDeclaration[],
): InterfaceDeclaration => {
  const first = interfaces[0];
  if (!first) throw new Error("Expected at least one interface");
  return first;
};

describe(extractPropertyNodes.name, () => {
  let project: Project;

  beforeEach(() => {
    project = new Project({ useInMemoryFileSystem: true });
  });

  const createContext = (filePath = "src/test.ts"): NodeExtractionContext => ({
    filePath,
    module: "core",
    package: "myapp",
  });

  it("extracts class property with type", () => {
    const sourceFile = project.createSourceFile(
      "src/test.ts",
      `class User {
  email: string;
}`,
    );
    const context = createContext();
    const classDecl = getFirstClass(sourceFile.getClasses());

    const properties = extractPropertyNodes(classDecl, context);

    expect(properties).toHaveLength(1);
    expect(properties[0]).toMatchObject({
      id: "src/test.ts:User.email",
      type: "Property",
      name: "email",
      module: "core",
      package: "myapp",
      filePath: "src/test.ts",
      exported: false,
      propertyType: "string",
      optional: false,
      readonly: false,
    });
  });

  it("extracts optional property", () => {
    const sourceFile = project.createSourceFile(
      "src/test.ts",
      `class User {
  middleName?: string;
}`,
    );
    const context = createContext();
    const classDecl = getFirstClass(sourceFile.getClasses());

    const properties = extractPropertyNodes(classDecl, context);

    expect(properties).toHaveLength(1);
    expect(properties[0]?.optional).toBe(true);
  });

  it("extracts readonly property", () => {
    const sourceFile = project.createSourceFile(
      "src/test.ts",
      `class User {
  readonly id: number;
}`,
    );
    const context = createContext();
    const classDecl = getFirstClass(sourceFile.getClasses());

    const properties = extractPropertyNodes(classDecl, context);

    expect(properties).toHaveLength(1);
    expect(properties[0]?.readonly).toBe(true);
  });

  it("extracts interface property", () => {
    const sourceFile = project.createSourceFile(
      "src/test.ts",
      `interface User {
  name: string;
  age?: number;
}`,
    );
    const context = createContext();
    const interfaceDecl = getFirstInterface(sourceFile.getInterfaces());

    const properties = extractPropertyNodes(interfaceDecl, context);

    expect(properties).toHaveLength(2);
    expect(properties[0]).toMatchObject({
      id: "src/test.ts:User.name",
      name: "name",
      propertyType: "string",
      optional: false,
    });
    expect(properties[1]).toMatchObject({
      id: "src/test.ts:User.age",
      name: "age",
      propertyType: "number",
      optional: true,
    });
  });

  it("extracts property without type annotation", () => {
    const sourceFile = project.createSourceFile(
      "src/test.ts",
      `class User {
  data;
}`,
    );
    const context = createContext();
    const classDecl = getFirstClass(sourceFile.getClasses());

    const properties = extractPropertyNodes(classDecl, context);

    expect(properties).toHaveLength(1);
    expect(properties[0]?.propertyType).toBeUndefined();
  });

  it("normalizes propertyType", () => {
    const sourceFile = project.createSourceFile(
      "src/test.ts",
      `class C { prop: {\n\ta: string;\n}; }`,
    );
    const classDecl = sourceFile.getClasses()[0];
    if (!classDecl) throw new Error("Expected class");
    const properties = extractPropertyNodes(classDecl, createContext());
    expect(properties[0]?.propertyType).not.toMatch(/[\n\t]/);
  });
});
