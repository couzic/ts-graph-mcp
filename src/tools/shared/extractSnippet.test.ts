import { describe, expect, it } from "vitest";
import { extractSnippet } from "./extractSnippet.js";

const sampleLines = [
  "import { foo } from './foo';",
  "",
  "function processData(input: string): string {",
  "  const validated = validate(input);",
  "  const transformed = transform(validated);",
  "  const result = format(transformed);",
  "  return result;",
  "}",
  "",
  "function helper() {",
  "  console.log('helper');",
  "  doWork();",
  "  console.log('done');",
  "}",
  "",
  "export { processData };",
];

describe(extractSnippet.name, () => {
  describe("no call sites", () => {
    it("extracts entire function when contextLines >= function size", () => {
      const result = extractSnippet({
        lines: sampleLines,
        startLine: 3,
        endLine: 8,
        callSites: [],
        contextLines: 10,
      });

      expect(result).toEqual([
        { line: 3, code: "function processData(input: string): string {" },
        { line: 4, code: "  const validated = validate(input);" },
        { line: 5, code: "  const transformed = transform(validated);" },
        { line: 6, code: "  const result = format(transformed);" },
        { line: 7, code: "  return result;" },
        { line: 8, code: "}" },
      ]);
    });

    it("limits to contextLines when function is larger", () => {
      const lines = Array.from({ length: 10 }, (_, i) => `  line ${i + 1}`);

      const result = extractSnippet({
        lines,
        startLine: 1,
        endLine: 10,
        callSites: [],
        contextLines: 3,
      });

      expect(result).toEqual([
        { line: 1, code: "  line 1" },
        { line: 2, code: "  line 2" },
        { line: 3, code: "  line 3" },
      ]);
    });
  });

  describe("single call site", () => {
    it("extracts context around call site for large functions", () => {
      const result = extractSnippet({
        lines: sampleLines,
        startLine: 3,
        endLine: 8,
        callSites: [{ start: 5, end: 5 }],
        contextLines: 1,
      });

      expect(result).toEqual([
        { line: 4, code: "  const validated = validate(input);" },
        { line: 5, code: "  const transformed = transform(validated);" },
        { line: 6, code: "  const result = format(transformed);" },
      ]);
    });

    it("returns full function when too small for call site context", () => {
      const result = extractSnippet({
        lines: sampleLines,
        startLine: 10,
        endLine: 14,
        callSites: [{ start: 12, end: 12 }],
        contextLines: 3,
      });

      expect(result).toEqual([
        { line: 10, code: "function helper() {" },
        { line: 11, code: "  console.log('helper');" },
        { line: 12, code: "  doWork();" },
        { line: 13, code: "  console.log('done');" },
        { line: 14, code: "}" },
      ]);
    });

    it("clamps to file boundaries", () => {
      const result = extractSnippet({
        lines: sampleLines,
        startLine: 1,
        endLine: 16,
        callSites: [{ start: 1, end: 1 }],
        contextLines: 2,
      });

      expect(result).toEqual([
        { line: 1, code: "import { foo } from './foo';" },
        { line: 2, code: "" },
        { line: 3, code: "function processData(input: string): string {" },
      ]);
    });
  });

  describe("multiple call sites", () => {
    it("extracts context around each call site", () => {
      const result = extractSnippet({
        lines: sampleLines,
        startLine: 1,
        endLine: 16,
        callSites: [
          { start: 4, end: 4 },
          { start: 12, end: 12 },
        ],
        contextLines: 1,
      });

      expect(result).toEqual([
        { line: 3, code: "function processData(input: string): string {" },
        { line: 4, code: "  const validated = validate(input);" },
        { line: 5, code: "  const transformed = transform(validated);" },
        { line: 11, code: "  console.log('helper');" },
        { line: 12, code: "  doWork();" },
        { line: 13, code: "  console.log('done');" },
      ]);
    });

    it("fills small gaps (1-2 lines) between ranges", () => {
      const lines = [
        "function test() {",
        "  setup();",
        "  // comment",
        "  target();", // call site
        "  // gap 1",
        "  target();", // call site
        "  // gap 2a",
        "  // gap 2b",
        "  target();", // call site
        "  // gap 3a",
        "  // gap 3b",
        "  // gap 3c",
        "  target();", // call site
        "  cleanup();",
        "}",
      ];

      const result = extractSnippet({
        lines,
        startLine: 1,
        endLine: 15,
        callSites: [
          { start: 4, end: 4 },
          { start: 6, end: 6 },
          { start: 9, end: 9 },
          { start: 13, end: 13 },
        ],
        contextLines: 0,
      });

      expect(result).toEqual([
        { line: 4, code: "  target();" },
        { line: 5, code: "  // gap 1" },
        { line: 6, code: "  target();" },
        { line: 7, code: "  // gap 2a" },
        { line: 8, code: "  // gap 2b" },
        { line: 9, code: "  target();" },
        // gap of 3 lines NOT filled
        { line: 13, code: "  target();" },
      ]);
    });
  });
});
