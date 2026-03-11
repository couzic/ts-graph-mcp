import assert from "node:assert";
import { Project } from "ts-morph";
import { describe, expect, it } from "vitest";
import { parseFeatureFile } from "../specs/parseFeatureFile.js";
import { extractSpecEdges } from "./extractSpecEdges.js";

/**
 * @spec traceability::specifies
 * @spec traceability::verified-by
 */
describe("extractSpecEdges", () => {
  const createProject = () => new Project({ useInMemoryFileSystem: true });

  const specIdMap = new Map([
    [
      "my-feature::some-spec",
      "specs/my-feature.feature.md:Spec:my-feature::some-spec",
    ],
    [
      "my-feature::other-spec",
      "specs/my-feature.feature.md:Spec:my-feature::other-spec",
    ],
  ]);

  it("creates SPECIFIES edge for @spec on a top-level function", () => {
    const project = createProject();
    const sourceFile = project.createSourceFile(
      "src/utils.ts",
      `/** @spec my-feature::some-spec */
export function formatDate(date: Date): string {
  return date.toISOString();
}`,
    );

    const edges = extractSpecEdges(sourceFile, "src/utils.ts", specIdMap);

    expect(edges).toHaveLength(1);
    expect(edges[0]).toEqual({
      source: "specs/my-feature.feature.md:Spec:my-feature::some-spec",
      target: "src/utils.ts:Function:formatDate",
      type: "SPECIFIES",
    });
  });

  it("creates SPECIFIES edge for @spec on a top-level arrow function", () => {
    const project = createProject();
    const sourceFile = project.createSourceFile(
      "src/utils.ts",
      `/** @spec my-feature::some-spec */
export const formatDate = (date: Date): string => {
  return date.toISOString();
};`,
    );

    const edges = extractSpecEdges(sourceFile, "src/utils.ts", specIdMap);

    expect(edges).toHaveLength(1);
    expect(edges[0]).toEqual({
      source: "specs/my-feature.feature.md:Spec:my-feature::some-spec",
      target: "src/utils.ts:Function:formatDate",
      type: "SPECIFIES",
    });
  });

  it("creates SPECIFIES edge for @spec on a declaration inside a function body", () => {
    const project = createProject();
    const sourceFile = project.createSourceFile(
      "src/service.ts",
      `export const processRequest = () => {
  /** @spec my-feature::some-spec */
  const result = doSomething();
  return result;
};`,
    );

    const edges = extractSpecEdges(sourceFile, "src/service.ts", specIdMap);

    expect(edges).toHaveLength(1);
    expect(edges[0]).toEqual({
      source: "specs/my-feature.feature.md:Spec:my-feature::some-spec",
      target: "src/service.ts:Function:processRequest",
      type: "SPECIFIES",
    });
  });

  it("creates VERIFIED_BY edge for @spec on a describe block in a test file", () => {
    const project = createProject();
    const sourceFile = project.createSourceFile(
      "src/utils.test.ts",
      `/** @spec my-feature::some-spec */
describe("formatDate", () => {
  it("formats ISO dates", () => {
    expect(true).toBe(true);
  });
});`,
    );

    const edges = extractSpecEdges(sourceFile, "src/utils.test.ts", specIdMap);

    expect(edges).toHaveLength(1);
    expect(edges[0]).toEqual({
      source: "specs/my-feature.feature.md:Spec:my-feature::some-spec",
      target: "src/utils.test.ts:TestSuite:formatDate",
      type: "VERIFIED_BY",
    });
  });

  it("creates VERIFIED_BY edge for @spec on an it block in a test file", () => {
    const project = createProject();
    const sourceFile = project.createSourceFile(
      "src/utils.test.ts",
      `describe("formatDate", () => {
  /** @spec my-feature::some-spec */
  it("formats ISO dates", () => {
    expect(true).toBe(true);
  });
});`,
    );

    const edges = extractSpecEdges(sourceFile, "src/utils.test.ts", specIdMap);

    expect(edges).toHaveLength(1);
    expect(edges[0]).toEqual({
      source: "specs/my-feature.feature.md:Spec:my-feature::some-spec",
      target: "src/utils.test.ts:Test:formatDate > formats ISO dates",
      type: "VERIFIED_BY",
    });
  });

  it("skips unknown spec IDs not in specIdMap", () => {
    const project = createProject();
    const sourceFile = project.createSourceFile(
      "src/utils.ts",
      `/** @spec unknown-feature::nonexistent */
export function formatDate(date: Date): string {
  return date.toISOString();
}`,
    );

    const edges = extractSpecEdges(sourceFile, "src/utils.ts", specIdMap);

    expect(edges).toHaveLength(0);
  });

  it("creates multiple edges for multiple @spec tags on same node", () => {
    const project = createProject();
    const sourceFile = project.createSourceFile(
      "src/utils.ts",
      `/**
 * @spec my-feature::some-spec
 * @spec my-feature::other-spec
 */
export function formatDate(date: Date): string {
  return date.toISOString();
}`,
    );

    const edges = extractSpecEdges(sourceFile, "src/utils.ts", specIdMap);

    expect(edges).toHaveLength(2);
    expect(edges).toContainEqual({
      source: "specs/my-feature.feature.md:Spec:my-feature::some-spec",
      target: "src/utils.ts:Function:formatDate",
      type: "SPECIFIES",
    });
    expect(edges).toContainEqual({
      source: "specs/my-feature.feature.md:Spec:my-feature::other-spec",
      target: "src/utils.ts:Function:formatDate",
      type: "SPECIFIES",
    });
  });

  it("creates SPECIFIES edge for @spec on a class declaration", () => {
    const project = createProject();
    const sourceFile = project.createSourceFile(
      "src/user.ts",
      `/** @spec my-feature::some-spec */
export class UserService {
  save(): void {}
}`,
    );

    const edges = extractSpecEdges(sourceFile, "src/user.ts", specIdMap);

    expect(edges).toHaveLength(1);
    expect(edges[0]).toEqual({
      source: "specs/my-feature.feature.md:Spec:my-feature::some-spec",
      target: "src/user.ts:Class:UserService",
      type: "SPECIFIES",
    });
  });

  it("creates SPECIFIES edge for @spec on a method declaration", () => {
    const project = createProject();
    const sourceFile = project.createSourceFile(
      "src/user.ts",
      `export class UserService {
  /** @spec my-feature::some-spec */
  save(): void {}
}`,
    );

    const edges = extractSpecEdges(sourceFile, "src/user.ts", specIdMap);

    expect(edges).toHaveLength(1);
    expect(edges[0]).toEqual({
      source: "specs/my-feature.feature.md:Spec:my-feature::some-spec",
      target: "src/user.ts:Method:UserService.save",
      type: "SPECIFIES",
    });
  });

  it("creates VERIFIED_BY edge for @spec on a nested describe in test file", () => {
    const project = createProject();
    const sourceFile = project.createSourceFile(
      "src/utils.test.ts",
      `describe("formatDate", () => {
  /** @spec my-feature::some-spec */
  describe("edge cases", () => {
    it("handles null", () => {});
  });
});`,
    );

    const edges = extractSpecEdges(sourceFile, "src/utils.test.ts", specIdMap);

    expect(edges).toHaveLength(1);
    expect(edges[0]).toEqual({
      source: "specs/my-feature.feature.md:Spec:my-feature::some-spec",
      target: "src/utils.test.ts:TestSuite:formatDate > edge cases",
      type: "VERIFIED_BY",
    });
  });

  it("handles integration test file names", () => {
    const project = createProject();
    const sourceFile = project.createSourceFile(
      "src/db.integration.test.ts",
      `/** @spec my-feature::some-spec */
describe("database", () => {
  it("connects", () => {});
});`,
    );

    const edges = extractSpecEdges(
      sourceFile,
      "src/db.integration.test.ts",
      specIdMap,
    );

    expect(edges).toHaveLength(1);
    expect(edges[0]).toEqual({
      source: "specs/my-feature.feature.md:Spec:my-feature::some-spec",
      target: "src/db.integration.test.ts:TestSuite:database",
      type: "VERIFIED_BY",
    });
  });

  it("handles e2e test file names", () => {
    const project = createProject();
    const sourceFile = project.createSourceFile(
      "src/server.e2e.test.ts",
      `/** @spec my-feature::some-spec */
describe("server", () => {
  it("starts", () => {});
});`,
    );

    const edges = extractSpecEdges(
      sourceFile,
      "src/server.e2e.test.ts",
      specIdMap,
    );

    expect(edges).toHaveLength(1);
    expect(edges[0]).toEqual({
      source: "specs/my-feature.feature.md:Spec:my-feature::some-spec",
      target: "src/server.e2e.test.ts:TestSuite:server",
      type: "VERIFIED_BY",
    });
  });

  it("creates SPECIFIES edge for @spec on a variable statement", () => {
    const project = createProject();
    const sourceFile = project.createSourceFile(
      "src/config.ts",
      `/** @spec my-feature::some-spec */
export const NODE_TYPES = ["Function", "Class"] as const;`,
    );

    const edges = extractSpecEdges(sourceFile, "src/config.ts", specIdMap);

    expect(edges).toHaveLength(1);
    expect(edges[0]).toEqual({
      source: "specs/my-feature.feature.md:Spec:my-feature::some-spec",
      target: "src/config.ts:Variable:NODE_TYPES",
      type: "SPECIFIES",
    });
  });

  it("creates SPECIFIES edge for @spec on an interface declaration", () => {
    const project = createProject();
    const sourceFile = project.createSourceFile(
      "src/types.ts",
      `/** @spec my-feature::some-spec */
export interface Edge {
  source: string;
  target: string;
  type: string;
}`,
    );

    const edges = extractSpecEdges(sourceFile, "src/types.ts", specIdMap);

    expect(edges).toHaveLength(1);
    expect(edges[0]).toEqual({
      source: "specs/my-feature.feature.md:Spec:my-feature::some-spec",
      target: "src/types.ts:Interface:Edge",
      type: "SPECIFIES",
    });
  });

  it("creates SPECIFIES edge for @spec on a type alias declaration", () => {
    const project = createProject();
    const sourceFile = project.createSourceFile(
      "src/types.ts",
      `/** @spec my-feature::some-spec */
export type NodeType = "Function" | "Class";`,
    );

    const edges = extractSpecEdges(sourceFile, "src/types.ts", specIdMap);

    expect(edges).toHaveLength(1);
    expect(edges[0]).toEqual({
      source: "specs/my-feature.feature.md:Spec:my-feature::some-spec",
      target: "src/types.ts:TypeAlias:NodeType",
      type: "SPECIFIES",
    });
  });

  it("creates SPECIFIES edge targeting enclosing function for @spec on expression statement", () => {
    const project = createProject();
    const sourceFile = project.createSourceFile(
      "src/server.ts",
      `export const startServer = () => {
  /** @spec my-feature::some-spec */
  app.get("/health", (_req, res) => { res.json({ status: "ok" }); });
};`,
    );

    const edges = extractSpecEdges(sourceFile, "src/server.ts", specIdMap);

    expect(edges).toHaveLength(1);
    expect(edges[0]).toEqual({
      source: "specs/my-feature.feature.md:Spec:my-feature::some-spec",
      target: "src/server.ts:Function:startServer",
      type: "SPECIFIES",
    });
  });

  it("works with specIdMap built from parseFeatureFile output", () => {
    const featureMarkdown = `# My Feature

**ID:** \`my-feature\`

### Some spec

> \`{#my-feature::some-spec}\`

Spec content.
`;
    const featureFilePath = "specs/my-feature.feature.md";
    const parsed = parseFeatureFile(featureMarkdown, featureFilePath);

    assert(parsed.specs[0] !== undefined);

    // Build specIdMap from parseFeatureFile output (the real pipeline flow)
    const realSpecIdMap = new Map<string, string>();
    for (const spec of parsed.specs) {
      realSpecIdMap.set(spec.name, spec.id);
    }

    const project = createProject();
    const sourceFile = project.createSourceFile(
      "src/utils.ts",
      `/** @spec my-feature::some-spec */
export function formatDate(date: Date): string {
  return date.toISOString();
}`,
    );

    const edges = extractSpecEdges(sourceFile, "src/utils.ts", realSpecIdMap);

    expect(edges).toHaveLength(1);
    expect(edges[0]).toEqual({
      source: parsed.specs[0].id,
      target: "src/utils.ts:Function:formatDate",
      type: "SPECIFIES",
    });
  });
});
