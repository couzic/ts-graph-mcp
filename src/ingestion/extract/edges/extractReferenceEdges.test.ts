import { Project } from "ts-morph";
import { describe, expect, it } from "vitest";
import { generateNodeId } from "../../generateNodeId.js";
import type { EdgeExtractionContext } from "./EdgeExtractionContext.js";
import { extractReferenceEdges } from "./extractReferenceEdges.js";

describe(extractReferenceEdges.name, () => {
  const createProject = () => new Project({ useInMemoryFileSystem: true });

  const defaultContext: EdgeExtractionContext = {
    filePath: "test.ts",
    module: "test-module",
    package: "test-package",
  };

  describe("callback arguments", () => {
    it("extracts REFERENCES for callback to map()", () => {
      const project = createProject();
      const sourceFile = project.createSourceFile(
        "test.ts",
        `
export const double = (n: number) => n * 2;
export const process = (nums: number[]) => nums.map(double);
        `,
      );

      const edges = extractReferenceEdges(sourceFile, defaultContext);

      expect(edges).toContainEqual({
        source: generateNodeId("test.ts", "process"),
        target: generateNodeId("test.ts", "double"),
        type: "REFERENCES",
        referenceContext: "callback",
      });
    });

    it("extracts REFERENCES for callback to filter()", () => {
      const project = createProject();
      const sourceFile = project.createSourceFile(
        "test.ts",
        `
export const isEven = (n: number) => n % 2 === 0;
export const filterEvens = (nums: number[]) => nums.filter(isEven);
        `,
      );

      const edges = extractReferenceEdges(sourceFile, defaultContext);

      expect(edges).toContainEqual({
        source: generateNodeId("test.ts", "filterEvens"),
        target: generateNodeId("test.ts", "isEven"),
        type: "REFERENCES",
        referenceContext: "callback",
      });
    });
  });

  describe("object properties", () => {
    it("extracts REFERENCES for object property value", () => {
      const project = createProject();
      const sourceFile = project.createSourceFile(
        "test.ts",
        `
export const handleClick = () => console.log('clicked');
export const config = { onClick: handleClick };
        `,
      );

      const edges = extractReferenceEdges(sourceFile, defaultContext);

      expect(edges).toContainEqual({
        source: generateNodeId("test.ts", "config"),
        target: generateNodeId("test.ts", "handleClick"),
        type: "REFERENCES",
        referenceContext: "property",
      });
    });

    it("extracts REFERENCES for shorthand property", () => {
      const project = createProject();
      const sourceFile = project.createSourceFile(
        "test.ts",
        `
export const handler = () => {};
export const routes = { handler };
        `,
      );

      const edges = extractReferenceEdges(sourceFile, defaultContext);

      expect(edges).toContainEqual({
        source: generateNodeId("test.ts", "routes"),
        target: generateNodeId("test.ts", "handler"),
        type: "REFERENCES",
        referenceContext: "property",
      });
    });

    it("extracts multiple REFERENCES from object with multiple handler properties", () => {
      const project = createProject();
      const sourceFile = project.createSourceFile(
        "test.ts",
        `
export const handleCreate = () => {};
export const handleDelete = () => {};
export const handlers = { create: handleCreate, delete: handleDelete };
        `,
      );

      const edges = extractReferenceEdges(sourceFile, defaultContext);

      expect(edges).toContainEqual({
        source: generateNodeId("test.ts", "handlers"),
        target: generateNodeId("test.ts", "handleCreate"),
        type: "REFERENCES",
        referenceContext: "property",
      });
      expect(edges).toContainEqual({
        source: generateNodeId("test.ts", "handlers"),
        target: generateNodeId("test.ts", "handleDelete"),
        type: "REFERENCES",
        referenceContext: "property",
      });
    });
  });

  describe("array elements", () => {
    it("extracts REFERENCES for array elements", () => {
      const project = createProject();
      const sourceFile = project.createSourceFile(
        "test.ts",
        `
export const fn1 = () => 1;
export const fn2 = () => 2;
export const handlers = [fn1, fn2];
        `,
      );

      const edges = extractReferenceEdges(sourceFile, defaultContext);

      expect(edges).toContainEqual({
        source: generateNodeId("test.ts", "handlers"),
        target: generateNodeId("test.ts", "fn1"),
        type: "REFERENCES",
        referenceContext: "array",
      });
      expect(edges).toContainEqual({
        source: generateNodeId("test.ts", "handlers"),
        target: generateNodeId("test.ts", "fn2"),
        type: "REFERENCES",
        referenceContext: "array",
      });
    });
  });

  describe("return values", () => {
    it("extracts REFERENCES for return value", () => {
      const project = createProject();
      const sourceFile = project.createSourceFile(
        "test.ts",
        `
export const createHandler = () => {};
export const factory = () => {
  return createHandler;
};
        `,
      );

      const edges = extractReferenceEdges(sourceFile, defaultContext);

      expect(edges).toContainEqual({
        source: generateNodeId("test.ts", "factory"),
        target: generateNodeId("test.ts", "createHandler"),
        type: "REFERENCES",
        referenceContext: "return",
      });
    });
  });

  describe("variable assignments", () => {
    it("extracts REFERENCES for variable assignment", () => {
      const project = createProject();
      const sourceFile = project.createSourceFile(
        "test.ts",
        `
export const original = () => 'hello';
export const alias = original;
        `,
      );

      const edges = extractReferenceEdges(sourceFile, defaultContext);

      expect(edges).toContainEqual({
        source: generateNodeId("test.ts", "alias"),
        target: generateNodeId("test.ts", "original"),
        type: "REFERENCES",
        referenceContext: "assignment",
      });
    });
  });

  describe("variable access (multi-hop pattern)", () => {
    it("extracts REFERENCES for variable access via element access", () => {
      const project = createProject();
      const sourceFile = project.createSourceFile(
        "test.ts",
        `
type UserType = "customer" | "admin";
const formatCustomer = () => "customer";
const formatAdmin = () => "admin";
const userFormatters = { customer: formatCustomer, admin: formatAdmin };
export function dispatch(type: UserType) {
  return userFormatters[type];
}
        `,
      );

      const edges = extractReferenceEdges(sourceFile, defaultContext);

      // dispatch references userFormatters (via element access)
      expect(edges).toContainEqual({
        source: generateNodeId("test.ts", "dispatch"),
        target: generateNodeId("test.ts", "userFormatters"),
        type: "REFERENCES",
        referenceContext: "access",
      });

      // userFormatters references the functions (via object properties)
      expect(edges).toContainEqual({
        source: generateNodeId("test.ts", "userFormatters"),
        target: generateNodeId("test.ts", "formatCustomer"),
        type: "REFERENCES",
        referenceContext: "property",
      });
      expect(edges).toContainEqual({
        source: generateNodeId("test.ts", "userFormatters"),
        target: generateNodeId("test.ts", "formatAdmin"),
        type: "REFERENCES",
        referenceContext: "property",
      });
    });
  });

  describe("exclusions", () => {
    it("does NOT extract REFERENCES for call expressions (those are CALLS)", () => {
      const project = createProject();
      const sourceFile = project.createSourceFile(
        "test.ts",
        `
export const greet = (name: string) => \`Hello \${name}\`;
export const main = () => greet('world');
        `,
      );

      const edges = extractReferenceEdges(sourceFile, defaultContext);

      // greet is called, not referenced - should not appear
      const hasGreetRef = edges.some(
        (e) =>
          e.target === generateNodeId("test.ts", "greet") &&
          e.source === generateNodeId("test.ts", "main"),
      );
      expect(hasGreetRef).toBe(false);
    });

    it("does NOT extract REFERENCES for function definitions", () => {
      const project = createProject();
      const sourceFile = project.createSourceFile(
        "test.ts",
        `
export const myFunc = () => {};
        `,
      );

      const edges = extractReferenceEdges(sourceFile, defaultContext);

      // Self-reference via definition should not appear
      const hasSelfRef = edges.some(
        (e) =>
          e.source === generateNodeId("test.ts", "myFunc") &&
          e.target === generateNodeId("test.ts", "myFunc"),
      );
      expect(hasSelfRef).toBe(false);
    });

    it("does NOT extract REFERENCES for arrow function initializers", () => {
      const project = createProject();
      const sourceFile = project.createSourceFile(
        "test.ts",
        `
export const myFunc = () => 42;
        `,
      );

      const edges = extractReferenceEdges(sourceFile, defaultContext);

      // Arrow function definitions are not references
      expect(edges).toHaveLength(0);
    });
  });

  describe("cross-file references", () => {
    it("extracts cross-file REFERENCES via imports", () => {
      const project = createProject();

      project.createSourceFile(
        "utils.ts",
        `
export const formatDate = (d: Date) => d.toISOString();
        `,
      );

      const mainFile = project.createSourceFile(
        "main.ts",
        `
import { formatDate } from './utils';
export const process = (dates: Date[]) => dates.map(formatDate);
        `,
      );

      const edges = extractReferenceEdges(mainFile, {
        filePath: "main.ts",
        module: "test-module",
        package: "test-package",
      });

      expect(edges).toContainEqual({
        source: generateNodeId("main.ts", "process"),
        target: generateNodeId("utils.ts", "formatDate"),
        type: "REFERENCES",
        referenceContext: "callback",
      });
    });
  });
});
