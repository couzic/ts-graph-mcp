import type { NodeType } from "@ts-graph/shared";
import { Project } from "ts-morph";
import { beforeEach, describe, expect, it } from "vitest";
import { extractNodes } from "./extractNodes.js";
import type { NodeExtractionContext } from "./NodeExtractionContext.js";

describe(extractNodes.name, () => {
  let project: Project;

  beforeEach(() => {
    project = new Project({ useInMemoryFileSystem: true });
  });

  const createContext = (filePath = "src/test.ts"): NodeExtractionContext => ({
    filePath,
    package: "myapp",
  });

  it("extracts all node types from a comprehensive source file", () => {
    const sourceFile = project.createSourceFile(
      "src/comprehensive.ts",
      `
export const VERSION = "1.0.0";

export type UserId = string;

export interface IUser {
  id: UserId;
  name: string;
}

export class User implements IUser {
  id: UserId;
  name: string;

  constructor(id: UserId, name: string) {
    this.id = id;
    this.name = name;
  }

  public validate(): boolean {
    return true;
  }
}

export function createUser(name: string): User {
  return new User("123", name);
}
`,
    );
    const context = createContext("src/comprehensive.ts");

    const nodes = extractNodes(sourceFile, context);

    // Should extract: Variable, TypeAlias, Interface, Class, Function, Method
    // Properties are intentionally NOT extracted (they add noise to search and slow indexing)
    expect(nodes.length).toBe(6);

    const nodesByType = nodes.reduce(
      (acc, node) => {
        acc[node.type] = (acc[node.type] || 0) + 1;
        return acc;
      },
      {} as Record<NodeType, number>,
    );

    expect(nodesByType.Variable).toBe(1);
    expect(nodesByType.TypeAlias).toBe(1);
    expect(nodesByType.Interface).toBe(1);
    expect(nodesByType.Class).toBe(1);
    expect(nodesByType.Function).toBe(1);
    expect(nodesByType.Method).toBe(1);
  });

  it("returns empty for empty file", () => {
    const sourceFile = project.createSourceFile("src/empty.ts", "");
    const context = createContext("src/empty.ts");

    const nodes = extractNodes(sourceFile, context);

    expect(nodes).toHaveLength(0);
  });

  it("returns empty for file with only comments", () => {
    const sourceFile = project.createSourceFile(
      "src/comments.ts",
      `
// This is a comment
/* Block comment */
`,
    );
    const context = createContext("src/comments.ts");

    const nodes = extractNodes(sourceFile, context);

    expect(nodes).toHaveLength(0);
  });

  describe("default exports", () => {
    it("extracts default-exported variable as exported node", () => {
      const sourceFile = project.createSourceFile(
        "src/Component.tsx",
        `
const LoadingSpinner = () => {
  return <div>Loading</div>;
};
export default LoadingSpinner;
`,
      );
      const context = createContext("src/Component.tsx");

      const nodes = extractNodes(sourceFile, context);
      const spinner = nodes.find((n) => n.name === "LoadingSpinner");

      expect(spinner).toBeDefined();
      expect(spinner?.type).toBe("Function");
      expect(spinner?.exported).toBe(true);
    });
  });
});
