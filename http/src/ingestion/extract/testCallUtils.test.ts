import { Project, SyntaxKind } from "ts-morph";
import { describe, expect, it } from "vitest";
import {
  buildTestFullPath,
  getTestCallKind,
  getTestCallName,
  isTestFile,
} from "./testCallUtils.js";

const createProject = () => new Project({ useInMemoryFileSystem: true });

describe(isTestFile.name, () => {
  it("matches .test.ts files", () => {
    expect(isTestFile("src/utils.test.ts")).toBe(true);
  });

  it("matches .integration.test.ts files", () => {
    expect(isTestFile("src/db.integration.test.ts")).toBe(true);
  });

  it("matches .e2e.test.ts files", () => {
    expect(isTestFile("src/server.e2e.test.ts")).toBe(true);
  });

  it("rejects plain .ts files", () => {
    expect(isTestFile("src/utils.ts")).toBe(false);
  });

  it("rejects .spec.ts files", () => {
    expect(isTestFile("src/utils.spec.ts")).toBe(false);
  });

  it("rejects .test.tsx files", () => {
    expect(isTestFile("src/Component.test.tsx")).toBe(false);
  });

  it("rejects files with test in the name but wrong extension", () => {
    expect(isTestFile("src/testUtils.ts")).toBe(false);
  });
});

const findCallByName = (
  source: ReturnType<Project["createSourceFile"]>,
  name: string,
) => {
  const calls = source.getDescendantsOfKind(SyntaxKind.CallExpression);
  return calls.find((c) => {
    const firstArg = c.getArguments()[0];
    // biome-ignore lint/complexity/useOptionalChain: clearer with explicit check
    if (firstArg && firstArg.getText().includes(name)) {
      return true;
    }
    return false;
  });
};

describe(getTestCallKind.name, () => {
  it("returns 'describe' for describe()", () => {
    const project = createProject();
    const source = project.createSourceFile(
      "test.ts",
      `describe("x", () => {});`,
    );
    // biome-ignore lint/style/noNonNullAssertion: single call expression in source
    const call = source.getDescendantsOfKind(SyntaxKind.CallExpression)[0]!;
    expect(getTestCallKind(call)).toBe("describe");
  });

  it("returns 'it' for it()", () => {
    const project = createProject();
    const source = project.createSourceFile("test.ts", `it("x", () => {});`);
    // biome-ignore lint/style/noNonNullAssertion: single call expression in source
    const call = source.getDescendantsOfKind(SyntaxKind.CallExpression)[0]!;
    expect(getTestCallKind(call)).toBe("it");
  });

  it("returns undefined for other calls", () => {
    const project = createProject();
    const source = project.createSourceFile("test.ts", `console.log("x");`);
    // biome-ignore lint/style/noNonNullAssertion: single call expression in source
    const call = source.getDescendantsOfKind(SyntaxKind.CallExpression)[0]!;
    expect(getTestCallKind(call)).toBeUndefined();
  });
});

describe(getTestCallName.name, () => {
  it("extracts string literal name", () => {
    const project = createProject();
    const source = project.createSourceFile(
      "test.ts",
      `describe("formatDate", () => {});`,
    );
    // biome-ignore lint/style/noNonNullAssertion: single call expression in source
    const call = source.getDescendantsOfKind(SyntaxKind.CallExpression)[0]!;
    expect(getTestCallName(call)).toBe("formatDate");
  });

  it("returns undefined for non-string argument", () => {
    const project = createProject();
    const source = project.createSourceFile(
      "test.ts",
      `describe(myVar, () => {});`,
    );
    // biome-ignore lint/style/noNonNullAssertion: single call expression in source
    const call = source.getDescendantsOfKind(SyntaxKind.CallExpression)[0]!;
    expect(getTestCallName(call)).toBeUndefined();
  });
});

describe(buildTestFullPath.name, () => {
  it("returns name for top-level describe", () => {
    const project = createProject();
    const source = project.createSourceFile(
      "test.ts",
      `describe("formatDate", () => {});`,
    );
    // biome-ignore lint/style/noNonNullAssertion: single call expression in source
    const call = source.getDescendantsOfKind(SyntaxKind.CallExpression)[0]!;
    expect(buildTestFullPath(call)).toBe("formatDate");
  });

  it("returns name for top-level it", () => {
    const project = createProject();
    const source = project.createSourceFile(
      "test.ts",
      `it("does something", () => {});`,
    );
    // biome-ignore lint/style/noNonNullAssertion: single call expression in source
    const call = source.getDescendantsOfKind(SyntaxKind.CallExpression)[0]!;
    expect(buildTestFullPath(call)).toBe("does something");
  });

  it("builds path for nested it inside describe", () => {
    const project = createProject();
    const source = project.createSourceFile(
      "test.ts",
      `describe("formatDate", () => {
  it("handles null", () => {});
});`,
    );
    const itCall = findCallByName(source, "handles null");
    expect(itCall).toBeDefined();
    // biome-ignore lint/style/noNonNullAssertion: asserted defined above
    expect(buildTestFullPath(itCall!)).toBe("formatDate > handles null");
  });

  it("builds path for deeply nested structure", () => {
    const project = createProject();
    const source = project.createSourceFile(
      "test.ts",
      `describe("formatDate", () => {
  describe("edge cases", () => {
    it("handles null", () => {});
  });
});`,
    );
    const itCall = findCallByName(source, "handles null");
    expect(itCall).toBeDefined();
    // biome-ignore lint/style/noNonNullAssertion: asserted defined above
    expect(buildTestFullPath(itCall!)).toBe(
      "formatDate > edge cases > handles null",
    );
  });

  it("builds path for nested describe", () => {
    const project = createProject();
    const source = project.createSourceFile(
      "test.ts",
      `describe("formatDate", () => {
  describe("edge cases", () => {
    it("handles null", () => {});
  });
});`,
    );
    const describeCall = findCallByName(source, "edge cases");
    expect(describeCall).toBeDefined();
    // biome-ignore lint/style/noNonNullAssertion: asserted defined above
    expect(buildTestFullPath(describeCall!)).toBe("formatDate > edge cases");
  });
});
