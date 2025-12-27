import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { CallSiteRange } from "../../db/Types.js";
import { extractFunctionBody, extractLOCs } from "./extractSnippet.js";

const toRanges = (lines: number[]): CallSiteRange[] =>
  lines.map((l) => ({ start: l, end: l }));

describe(extractLOCs.name, () => {
  const testDir = join(process.cwd(), ".test-snippets");
  const testFile = join(testDir, "sample.ts");

  // 16 lines of code (1-indexed: lines 1-16)
  const sampleCode = `import { foo } from './foo';

function processData(input: string): string {
  const validated = validate(input);
  const transformed = transform(validated);
  const result = format(transformed);
  return result;
}

function helper() {
  console.log('helper');
  doWork();
  console.log('done');
}

export { processData };`;

  beforeAll(() => {
    mkdirSync(testDir, { recursive: true });
    writeFileSync(testFile, sampleCode);
  });

  afterAll(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it("extracts LOCs around single call site", () => {
    const locs = extractLOCs(testFile, toRanges([5]), 2);

    expect(locs).toHaveLength(5); // lines 3-7
    expect(locs[0]).toEqual({
      line: 3,
      code: "function processData(input: string): string {",
    });
    expect(locs[2]).toEqual({
      line: 5,
      code: "  const transformed = transform(validated);",
    });
    expect(locs[4]).toEqual({ line: 7, code: "  return result;" });
  });

  it("extracts LOCs around multiple call sites with gap", () => {
    // Call sites at lines 4 and 12, context=1
    const locs = extractLOCs(testFile, toRanges([4, 12]), 1);

    // Should get lines 3-5 and 11-13
    expect(locs).toHaveLength(6);
    expect(locs[0]?.line).toBe(3);
    expect(locs[2]?.line).toBe(5);
    // Gap here (lines 6-10 omitted)
    expect(locs[3]?.line).toBe(11);
    expect(locs[5]?.line).toBe(13);
  });

  it("allows caller to detect gaps between non-adjacent LOCs", () => {
    const locs = extractLOCs(testFile, toRanges([4, 12]), 1);

    // Check for gap between locs[2] (line 5) and locs[3] (line 11)
    const loc2 = locs[2];
    const loc3 = locs[3];
    if (!loc2 || !loc3) {
      expect.fail("Expected loc2 and loc3 to be defined");
    }
    const hasGap = loc3.line !== loc2.line + 1;
    expect(hasGap).toBe(true);
    expect(loc3.line - loc2.line - 1).toBe(5); // 5 lines omitted
  });

  it("handles multi-line call site ranges", () => {
    // Multi-line call: lines 4-6, context=1
    const locs = extractLOCs(testFile, [{ start: 4, end: 6 }], 1);

    // Should get lines 3-7 (4-1 to 6+1)
    expect(locs).toHaveLength(5);
    expect(locs[0]?.line).toBe(3);
    expect(locs[4]?.line).toBe(7);
  });

  it("merges overlapping ranges automatically via keepSet", () => {
    // Two call sites close together: 4 and 5, context=2
    // Site 4: keep 2-6, Site 5: keep 3-7 → merged: keep 2-7
    const locs = extractLOCs(testFile, toRanges([4, 5]), 2);

    expect(locs).toHaveLength(6); // lines 2-7
    expect(locs[0]?.line).toBe(2);
    expect(locs[5]?.line).toBe(7);
  });

  it("returns empty array for non-existent file", () => {
    const locs = extractLOCs("/non/existent/file.ts", toRanges([10]), 2);
    expect(locs).toEqual([]);
  });

  it("returns empty array for empty call sites", () => {
    const locs = extractLOCs(testFile, [], 2);
    expect(locs).toEqual([]);
  });

  it("handles call site at start of file", () => {
    const locs = extractLOCs(testFile, toRanges([1]), 2);

    expect(locs[0]?.line).toBe(1); // Can't go before line 1
    expect(locs).toHaveLength(3); // lines 1-3
  });

  it("handles call site at end of file", () => {
    const lineCount = sampleCode.split("\n").length;
    const locs = extractLOCs(testFile, toRanges([lineCount]), 2);

    expect(locs[locs.length - 1]?.line).toBe(lineCount);
  });

  it("preserves all call sites regardless of distance", () => {
    // Create file with 100 lines
    const longFile = join(testDir, "long.ts");
    const longCode = Array.from(
      { length: 100 },
      (_, i) => `const line${i + 1} = ${i + 1};`,
    ).join("\n");
    writeFileSync(longFile, longCode);

    // Call sites at lines 20 and 80, context=2
    const locs = extractLOCs(longFile, toRanges([20, 80]), 2);

    // Should have lines 18-22 and 78-82 = 10 lines
    expect(locs).toHaveLength(10);

    // First call site visible
    expect(locs.find((l) => l.line === 20)?.code).toBe("const line20 = 20;");

    // Second call site visible
    expect(locs.find((l) => l.line === 80)?.code).toBe("const line80 = 80;");

    // Gap in between: line 22 to line 78 = 56 line difference
    const locAt22 = locs.find((l) => l.line === 22);
    const locAt78 = locs.find((l) => l.line === 78);
    if (!locAt22 || !locAt78) {
      expect.fail("Expected locAt22 and locAt78 to be defined");
    }
    expect(locAt78.line - locAt22.line).toBe(56);
  });
});

describe(extractFunctionBody.name, () => {
  const testDir = join(process.cwd(), ".test-snippets-body");
  const testFile = join(testDir, "func.ts");

  const sampleCode = `function example() {
  const a = 1;
  const b = 2;
  return a + b;
}`;

  beforeAll(() => {
    mkdirSync(testDir, { recursive: true });
    writeFileSync(testFile, sampleCode);
  });

  afterAll(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it("extracts whole function body as LOC[]", () => {
    const locs = extractFunctionBody(testFile, 1, 5);

    expect(locs).toHaveLength(5);
    expect(locs[0]).toEqual({ line: 1, code: "function example() {" });
    expect(locs[4]).toEqual({ line: 5, code: "}" });
  });

  it("returns empty array for non-existent file", () => {
    const locs = extractFunctionBody("/non/existent/file.ts", 1, 5);
    expect(locs).toEqual([]);
  });
});
