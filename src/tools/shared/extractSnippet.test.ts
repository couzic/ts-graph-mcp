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

  it("fills small gaps (1-2 lines) between call site ranges", () => {
    // Lines with call sites at 4, 6, and 9 (gaps of 1 and 2 lines)
    const lines = [
      "function test() {", // 1
      "  setup();", // 2
      "  // comment", // 3
      "  target();", // 4 - call site
      "  // gap 1", // 5 - gap of 1 line
      "  target();", // 6 - call site
      "  // gap 2a", // 7 - gap of 2 lines
      "  // gap 2b", // 8
      "  target();", // 9 - call site
      "  // gap 3a", // 10 - gap of 3 lines (should NOT be filled)
      "  // gap 3b", // 11
      "  // gap 3c", // 12
      "  target();", // 13 - call site
      "  cleanup();", // 14
      "}", // 15
    ];

    const locs = extractSnippet({
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

    const lineNumbers = locs.map((loc) => loc.line);

    // Small gaps (1-2 lines) should be filled
    expect(lineNumbers).toContain(5); // 1-line gap between 4 and 6
    expect(lineNumbers).toContain(7); // 2-line gap between 6 and 9
    expect(lineNumbers).toContain(8);

    // Large gap (3 lines) should NOT be filled
    expect(lineNumbers).not.toContain(10);
    expect(lineNumbers).not.toContain(11);
    expect(lineNumbers).not.toContain(12);
  });
});
