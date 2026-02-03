import { Project } from "ts-morph";
import { describe, expect, it } from "vitest";
import type { EdgeExtractionContext } from "./EdgeExtractionContext.js";
import { extractEdges } from "./extractEdges.js";

describe(extractEdges.name, () => {
  const createProject = () => new Project({ useInMemoryFileSystem: true });

  const defaultContext: EdgeExtractionContext = {
    filePath: "test.ts",
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

    // Should contain RETURNS edges (from getUser and createUser)
    const returnsEdges = edges.filter((e) => e.type === "RETURNS");
    expect(returnsEdges.length).toBeGreaterThan(0);

    // Should contain HAS_PROPERTY edges (from UserService.config)
    const hasPropertyEdges = edges.filter((e) => e.type === "HAS_PROPERTY");
    expect(hasPropertyEdges.length).toBeGreaterThan(0);
  });
});
