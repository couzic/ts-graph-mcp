import { Project } from "ts-morph";
import { beforeEach, describe, expect, it } from "vitest";
import type { NodeType } from "../../../db/Types.js";
import { extractNodes } from "./extractNodes.js";
import type { NodeExtractionContext } from "./NodeExtractionContext.js";

describe.skip(extractNodes.name, () => {
  let project: Project;

  beforeEach(() => {
    project = new Project({ useInMemoryFileSystem: true });
  });

  const createContext = (filePath = "src/test.ts"): NodeExtractionContext => ({
    filePath,
    module: "core",
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

    // Should extract: File, Variable, TypeAlias, Interface, Class, Function
    // Plus: Interface properties (2), Class properties (2), Class method (1)
    expect(nodes.length).toBeGreaterThan(8);

    const nodesByType = nodes.reduce(
      (acc, node) => {
        acc[node.type] = (acc[node.type] || 0) + 1;
        return acc;
      },
      {} as Record<NodeType, number>,
    );

    expect(nodesByType.File).toBe(1);
    expect(nodesByType.Variable).toBe(1);
    expect(nodesByType.TypeAlias).toBe(1);
    expect(nodesByType.Interface).toBe(1);
    expect(nodesByType.Class).toBe(1);
    expect(nodesByType.Function).toBe(1);
    expect(nodesByType.Property).toBe(4); // 2 interface + 2 class
    expect(nodesByType.Method).toBe(1);
  });

  it("extracts file node even for empty file", () => {
    const sourceFile = project.createSourceFile("src/empty.ts", "");
    const context = createContext("src/empty.ts");

    const nodes = extractNodes(sourceFile, context);

    expect(nodes).toHaveLength(1);
    expect(nodes[0]?.type).toBe("File");
  });

  it("handles file with only comments", () => {
    const sourceFile = project.createSourceFile(
      "src/comments.ts",
      `
// This is a comment
/* Block comment */
`,
    );
    const context = createContext("src/comments.ts");

    const nodes = extractNodes(sourceFile, context);

    expect(nodes).toHaveLength(1);
    expect(nodes[0]?.type).toBe("File");
  });
});
