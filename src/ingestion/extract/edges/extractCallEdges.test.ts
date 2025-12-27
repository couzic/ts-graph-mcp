import { Project } from "ts-morph";
import { describe, expect, it } from "vitest";
import { generateNodeId } from "../../generateNodeId.js";
import type { EdgeExtractionContext } from "./EdgeExtractionContext.js";
import { extractCallEdges } from "./extractCallEdges.js";

describe(extractCallEdges.name, () => {
  const createProject = () => new Project({ useInMemoryFileSystem: true });

  const defaultContext: EdgeExtractionContext = {
    filePath: "test.ts",
    module: "test-module",
    package: "test-package",
  };

  it("extracts CALLS edges between functions", () => {
    const project = createProject();
    const sourceFile = project.createSourceFile(
      "test.ts",
      `
export const add = (a: number, b: number): number => a + b;
export const calculate = (x: number, y: number): number => add(x, y);
        `,
    );

    const edges = extractCallEdges(sourceFile, defaultContext);

    expect(edges).toHaveLength(1);
    expect(edges[0]).toEqual({
      source: generateNodeId("test.ts", "calculate"),
      target: generateNodeId("test.ts", "add"),
      type: "CALLS",
      callCount: 1,
      callSites: [{ start: 3, end: 3 }],
    });
  });

  it("collects call site line numbers for multiple calls", () => {
    const project = createProject();
    const sourceFile = project.createSourceFile(
      "test.ts",
      `
export const log = (msg: string) => console.log(msg);
export const doWork = () => {
  log('start');
  log('processing');
  log('done');
};
        `,
    );

    const edges = extractCallEdges(sourceFile, defaultContext);

    expect(edges).toHaveLength(1);
    expect(edges[0]).toEqual({
      source: generateNodeId("test.ts", "doWork"),
      target: generateNodeId("test.ts", "log"),
      type: "CALLS",
      callCount: 3,
      callSites: [
        { start: 4, end: 4 },
        { start: 5, end: 5 },
        { start: 6, end: 6 },
      ],
    });
  });

  it("extracts CALLS edges from method to function", () => {
    const project = createProject();
    const sourceFile = project.createSourceFile(
      "test.ts",
      `
export const validate = (value: string): boolean => value.length > 0;

export class User {
  name: string;

  isValid(): boolean {
    return validate(this.name);
  }
}
        `,
    );

    const edges = extractCallEdges(sourceFile, defaultContext);

    expect(edges).toHaveLength(1);
    expect(edges[0]).toEqual({
      source: generateNodeId("test.ts", "User", "isValid"),
      target: generateNodeId("test.ts", "validate"),
      type: "CALLS",
      callCount: 1,
      callSites: [{ start: 8, end: 8 }],
    });
  });

  it("extracts cross-file function calls", () => {
    const project = createProject();

    // File A: utility function to be called
    // Note: We create the file but don't need to reference it - handler.ts imports from it
    project.createSourceFile(
      "utils.ts",
      `
export const formatDate = (date: Date): string => {
  return date.toISOString();
};
        `,
    );

    // File B: handler that calls the utility
    const handlerFile = project.createSourceFile(
      "handler.ts",
      `
import { formatDate } from './utils';

export const processEvent = (timestamp: Date): string => {
  return formatDate(timestamp);
};
        `,
    );

    // Cross-file calls work via buildImportMap (ts-morph import resolution)
    const edges = extractCallEdges(handlerFile, {
      filePath: "handler.ts",
      module: "test-module",
      package: "test-package",
    });

    expect(edges).toHaveLength(1);
    expect(edges[0]).toEqual({
      source: generateNodeId("handler.ts", "processEvent"),
      target: generateNodeId("utils.ts", "formatDate"),
      type: "CALLS",
      callCount: 1,
      callSites: [{ start: 5, end: 5 }],
    });
  });

  it("extracts indirect call through local variable alias", () => {
    const project = createProject();

    const sourceFile = project.createSourceFile(
      "test.ts",
      `
export const target = (): string => "result";

export const caller = (): string => {
  const fn = target;
  return fn();
};
        `,
    );

    const edges = extractCallEdges(sourceFile, defaultContext);

    expect(edges).toHaveLength(1);
    expect(edges[0]).toEqual({
      source: generateNodeId("test.ts", "caller"),
      target: generateNodeId("test.ts", "target"),
      type: "CALLS",
      callCount: 1,
      callSites: [{ start: 6, end: 6 }],
    });
  });
});
