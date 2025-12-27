import { Project } from "ts-morph";
import { describe, expect, it } from "vitest";
import type { EdgeExtractionContext } from "./EdgeExtractionContext.js";
import { extractEdges } from "./extractEdges.js";

describe(extractEdges.name, () => {
  const createProject = () => new Project({ useInMemoryFileSystem: true });

  const defaultContext: EdgeExtractionContext = {
    filePath: "test.ts",
    module: "test-module",
    package: "test-package",
  };

  it("extracts all edge types from a source file", () => {
    const project = createProject();
    const sourceFile = project.createSourceFile(
      "test.ts",
      `
import type { Config } from './config.js';

export interface User {
  name: string;
}

export class UserService {
  config: Config;

  getUser(): User {
    return { name: 'Alice' };
  }
}

export const createUser = (name: string): User => {
  return { name };
};
        `,
    );

    const edges = extractEdges(sourceFile, defaultContext);

    // Should contain IMPORTS edges
    const importEdges = edges.filter((e) => e.type === "IMPORTS");
    expect(importEdges.length).toBeGreaterThan(0);

    // Should contain CONTAINS edges (File contains User, UserService, createUser)
    const containsEdges = edges.filter((e) => e.type === "CONTAINS");
    expect(containsEdges.length).toBe(3);

    // Should contain USES_TYPE edges
    const usesTypeEdges = edges.filter((e) => e.type === "USES_TYPE");
    expect(usesTypeEdges.length).toBeGreaterThan(0);
  });
});
