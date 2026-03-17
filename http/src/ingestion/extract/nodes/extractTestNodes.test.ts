import assert from "node:assert";
import { Project } from "ts-morph";
import { beforeEach, describe, expect, it } from "vitest";
import { extractTestNodes } from "./extractTestNodes.js";

describe("extractTestNodes", () => {
  let project: Project;

  beforeEach(() => {
    project = new Project({ useInMemoryFileSystem: true });
  });

  it("extracts top-level describe with one it", () => {
    const sourceFile = project.createSourceFile(
      "src/utils.test.ts",
      `describe("formatDate", () => {
  it("formats ISO dates", () => {
    expect(true).toBe(true);
  });
});`,
    );

    const result = extractTestNodes(sourceFile, "src/utils.test.ts");

    expect(result.nodes).toHaveLength(2);

    const suite = result.nodes.find((n) => n.type === "TestSuite");
    assert(suite !== undefined);
    expect(suite).toMatchObject({
      id: "src/utils.test.ts:TestSuite:formatDate",
      type: "TestSuite",
      name: "formatDate",
      filePath: "src/utils.test.ts",
      exported: false,
    });

    const test = result.nodes.find((n) => n.type === "Test");
    assert(test !== undefined);
    expect(test).toMatchObject({
      id: "src/utils.test.ts:Test:formatDate > formats ISO dates",
      type: "Test",
      name: "formats ISO dates",
      filePath: "src/utils.test.ts",
      exported: false,
    });
  });

  it("extracts nested describes", () => {
    const sourceFile = project.createSourceFile(
      "src/utils.test.ts",
      `describe("formatDate", () => {
  describe("edge cases", () => {
    it("handles null", () => {});
  });
});`,
    );

    const result = extractTestNodes(sourceFile, "src/utils.test.ts");

    expect(result.nodes).toHaveLength(3);

    const outerSuite = result.nodes.find(
      (n) => n.id === "src/utils.test.ts:TestSuite:formatDate",
    );
    assert(outerSuite !== undefined);
    expect(outerSuite.name).toBe("formatDate");

    const innerSuite = result.nodes.find(
      (n) => n.id === "src/utils.test.ts:TestSuite:formatDate > edge cases",
    );
    assert(innerSuite !== undefined);
    expect(innerSuite.name).toBe("edge cases");

    const test = result.nodes.find((n) => n.type === "Test");
    assert(test !== undefined);
    expect(test.id).toBe(
      "src/utils.test.ts:Test:formatDate > edge cases > handles null",
    );
  });

  it("extracts top-level it without describe", () => {
    const sourceFile = project.createSourceFile(
      "src/utils.test.ts",
      `it("formats ISO dates", () => {
  expect(true).toBe(true);
});`,
    );

    const result = extractTestNodes(sourceFile, "src/utils.test.ts");

    expect(result.nodes).toHaveLength(1);
    const test = result.nodes[0];
    assert(test !== undefined);
    expect(test).toMatchObject({
      id: "src/utils.test.ts:Test:formats ISO dates",
      type: "Test",
      name: "formats ISO dates",
      filePath: "src/utils.test.ts",
      exported: false,
    });
  });

  it("extracts multiple describes at same level", () => {
    const sourceFile = project.createSourceFile(
      "src/utils.test.ts",
      `describe("formatDate", () => {
  it("formats dates", () => {});
});

describe("parseDate", () => {
  it("parses dates", () => {});
});`,
    );

    const result = extractTestNodes(sourceFile, "src/utils.test.ts");

    const suites = result.nodes.filter((n) => n.type === "TestSuite");
    expect(suites).toHaveLength(2);
    expect(suites.map((s) => s.name)).toEqual(["formatDate", "parseDate"]);

    const tests = result.nodes.filter((n) => n.type === "Test");
    expect(tests).toHaveLength(2);
    // biome-ignore lint/style/noNonNullAssertion: length asserted above
    expect(tests[0]!.id).toBe(
      "src/utils.test.ts:Test:formatDate > formats dates",
    );
    // biome-ignore lint/style/noNonNullAssertion: length asserted above
    expect(tests[1]!.id).toBe(
      "src/utils.test.ts:Test:parseDate > parses dates",
    );
  });

  it("extracts deeply nested structure (3 levels)", () => {
    const sourceFile = project.createSourceFile(
      "src/utils.test.ts",
      `describe("level1", () => {
  describe("level2", () => {
    describe("level3", () => {
      it("deep test", () => {});
    });
  });
});`,
    );

    const result = extractTestNodes(sourceFile, "src/utils.test.ts");

    const suites = result.nodes.filter((n) => n.type === "TestSuite");
    expect(suites).toHaveLength(3);
    expect(suites.map((s) => s.id)).toEqual([
      "src/utils.test.ts:TestSuite:level1",
      "src/utils.test.ts:TestSuite:level1 > level2",
      "src/utils.test.ts:TestSuite:level1 > level2 > level3",
    ]);

    const test = result.nodes.find((n) => n.type === "Test");
    assert(test !== undefined);
    expect(test.id).toBe(
      "src/utils.test.ts:Test:level1 > level2 > level3 > deep test",
    );
  });

  it("produces correct CONTAINS edges", () => {
    const sourceFile = project.createSourceFile(
      "src/utils.test.ts",
      `describe("suite", () => {
  describe("nested", () => {
    it("test1", () => {});
  });
  it("test2", () => {});
});`,
    );

    const result = extractTestNodes(sourceFile, "src/utils.test.ts");

    expect(result.edges).toHaveLength(3);

    // suite -> nested
    expect(result.edges).toContainEqual({
      source: "src/utils.test.ts:TestSuite:suite",
      target: "src/utils.test.ts:TestSuite:suite > nested",
      type: "CONTAINS",
    });

    // nested -> test1
    expect(result.edges).toContainEqual({
      source: "src/utils.test.ts:TestSuite:suite > nested",
      target: "src/utils.test.ts:Test:suite > nested > test1",
      type: "CONTAINS",
    });

    // suite -> test2
    expect(result.edges).toContainEqual({
      source: "src/utils.test.ts:TestSuite:suite",
      target: "src/utils.test.ts:Test:suite > test2",
      type: "CONTAINS",
    });
  });

  it("reports correct line numbers", () => {
    const sourceFile = project.createSourceFile(
      "src/utils.test.ts",
      `describe("suite", () => {
  it("test", () => {
    expect(true).toBe(true);
  });
});`,
    );

    const result = extractTestNodes(sourceFile, "src/utils.test.ts");

    const suite = result.nodes.find((n) => n.type === "TestSuite");
    assert(suite !== undefined);
    expect(suite.startLine).toBe(1);
    expect(suite.endLine).toBe(5);

    const test = result.nodes.find((n) => n.type === "Test");
    assert(test !== undefined);
    expect(test.startLine).toBe(2);
    expect(test.endLine).toBe(4);
  });

  it("produces no CONTAINS edges for top-level it", () => {
    const sourceFile = project.createSourceFile(
      "src/utils.test.ts",
      `it("standalone test", () => {});`,
    );

    const result = extractTestNodes(sourceFile, "src/utils.test.ts");

    expect(result.nodes).toHaveLength(1);
    expect(result.edges).toHaveLength(0);
  });
});
