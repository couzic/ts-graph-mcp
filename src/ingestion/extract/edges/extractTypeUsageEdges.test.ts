import { Project } from "ts-morph";
import { describe, expect, it } from "vitest";
import { generateNodeId } from "../../generateNodeId.js";
import type { EdgeExtractionContext } from "./EdgeExtractionContext.js";
import { extractTypeUsageEdges } from "./extractTypeUsageEdges.js";

describe(extractTypeUsageEdges.name, () => {
  const createProject = () => new Project({ useInMemoryFileSystem: true });

  const defaultContext: EdgeExtractionContext = {
    filePath: "test.ts",
    module: "test-module",
    package: "test-package",
  };

  it("extracts USES_TYPE for function parameters", () => {
    const project = createProject();
    const sourceFile = project.createSourceFile(
      "test.ts",
      `
export interface User {
  name: string;
}

export const greet = (user: User): void => {
  console.log(user.name);
};
        `,
    );

    const edges = extractTypeUsageEdges(sourceFile, defaultContext);

    const paramEdge = edges.find(
      (e) =>
        e.source === generateNodeId("test.ts", "greet") &&
        e.context === "parameter",
    );
    expect(paramEdge).toBeDefined();
    expect(paramEdge).toEqual({
      source: generateNodeId("test.ts", "greet"),
      target: generateNodeId("test.ts", "User"),
      type: "USES_TYPE",
      context: "parameter",
    });
  });

  it("extracts USES_TYPE for function return types", () => {
    const project = createProject();
    const sourceFile = project.createSourceFile(
      "test.ts",
      `
export interface User {
  name: string;
}

export const getUser = (): User => {
  return { name: 'Alice' };
};
        `,
    );

    const edges = extractTypeUsageEdges(sourceFile, defaultContext);

    const returnEdge = edges.find(
      (e) =>
        e.source === generateNodeId("test.ts", "getUser") &&
        e.context === "return",
    );
    expect(returnEdge).toBeDefined();
    expect(returnEdge).toEqual({
      source: generateNodeId("test.ts", "getUser"),
      target: generateNodeId("test.ts", "User"),
      type: "USES_TYPE",
      context: "return",
    });
  });

  it("extracts USES_TYPE for variable declarations", () => {
    const project = createProject();
    const sourceFile = project.createSourceFile(
      "test.ts",
      `
export interface User {
  name: string;
}

export const user: User = { name: 'Alice' };
        `,
    );

    const edges = extractTypeUsageEdges(sourceFile, defaultContext);

    const varEdge = edges.find(
      (e) =>
        e.source === generateNodeId("test.ts", "user") &&
        e.context === "variable",
    );
    expect(varEdge).toBeDefined();
    expect(varEdge).toEqual({
      source: generateNodeId("test.ts", "user"),
      target: generateNodeId("test.ts", "User"),
      type: "USES_TYPE",
      context: "variable",
    });
  });

  it("extracts USES_TYPE for property declarations", () => {
    const project = createProject();
    const sourceFile = project.createSourceFile(
      "test.ts",
      `
export interface Address {
  street: string;
}

export class User {
  address: Address;
}
        `,
    );

    const edges = extractTypeUsageEdges(sourceFile, defaultContext);

    const propEdge = edges.find(
      (e) =>
        e.source === generateNodeId("test.ts", "User", "address") &&
        e.context === "property",
    );
    expect(propEdge).toBeDefined();
    expect(propEdge).toEqual({
      source: generateNodeId("test.ts", "User", "address"),
      target: generateNodeId("test.ts", "Address"),
      type: "USES_TYPE",
      context: "property",
    });
  });

  it("extracts cross-file USES_TYPE for imported types", () => {
    const project = createProject();

    // File A: type definition
    project.createSourceFile(
      "types.ts",
      `
export interface User {
  name: string;
}
      `,
    );

    // File B: service that imports and uses the type
    const serviceFile = project.createSourceFile(
      "service.ts",
      `
import type { User } from './types';

export const greet = (user: User): void => {
  console.log(user.name);
};
      `,
    );

    const serviceContext: EdgeExtractionContext = {
      filePath: "service.ts",
      module: "test-module",
      package: "test-package",
    };

    // Cross-file resolution works via buildImportMap (ts-morph import resolution)
    const edges = extractTypeUsageEdges(serviceFile, serviceContext);

    const crossFileEdge = edges.find(
      (e) =>
        e.source === generateNodeId("service.ts", "greet") &&
        e.target === generateNodeId("types.ts", "User"),
    );
    expect(crossFileEdge).toBeDefined();
    expect(crossFileEdge).toEqual({
      source: generateNodeId("service.ts", "greet"),
      target: generateNodeId("types.ts", "User"),
      type: "USES_TYPE",
      context: "parameter",
    });
  });
});
