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
  it("extracts entire function for small functions", () => {
    const locs = extractSnippet({
      lines: sampleLines,
      startLine: 3,
      endLine: 8,
      contextLines: 10,
    });

    expect(locs).toHaveLength(6);
    expect(locs[0]).toEqual({
      line: 3,
      code: "function processData(input: string): string {",
    });
    expect(locs[5]).toEqual({ line: 8, code: "}" });
  });

  it("extracts context around call sites for large functions", () => {
    // Function spans lines 3-8 (6 lines), context=2
    // 6 > 2*2, so call sites should be used
    const locs = extractSnippet({
      lines: sampleLines,
      startLine: 3,
      endLine: 8,
      callSites: [{ start: 5, end: 5 }],
      contextLines: 1,
    });

    // Should get lines 4-6 (call site 5 ± 1 context)
    expect(locs).toHaveLength(3);
    expect(locs[0]?.line).toBe(4);
    expect(locs[1]?.line).toBe(5);
    expect(locs[2]?.line).toBe(6);
  });

  it("falls back to full function when too small for call site context", () => {
    // Function spans lines 10-14 (5 lines), context=3
    // 5 <= 3*2, so full function body should be used
    const locs = extractSnippet({
      lines: sampleLines,
      startLine: 10,
      endLine: 14,
      callSites: [{ start: 12, end: 12 }],
      contextLines: 3,
    });

    expect(locs).toHaveLength(5);
    expect(locs[0]?.line).toBe(10);
    expect(locs[4]?.line).toBe(14);
  });

  it("handles multiple call sites with gaps", () => {
    const locs = extractSnippet({
      lines: sampleLines,
      startLine: 1,
      endLine: 16,
      callSites: [
        { start: 4, end: 4 },
        { start: 12, end: 12 },
      ],
      contextLines: 1,
    });

    // Lines 3-5 and 11-13
    expect(locs).toHaveLength(6);
    expect(locs[2]?.line).toBe(5);
    expect(locs[3]?.line).toBe(11); // Gap from 5 to 11
  });

  it("clamps to file boundaries", () => {
    const locs = extractSnippet({
      lines: sampleLines,
      startLine: 1,
      endLine: 16,
      callSites: [{ start: 1, end: 1 }],
      contextLines: 5,
    });

    expect(locs[0]?.line).toBe(1); // Can't go below 1
  });
});
