import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { extractSnippets } from "./extractSnippet.js";

describe.skip(extractSnippets.name, () => {
  const testDir = join(process.cwd(), ".test-snippets");
  const testFile = join(testDir, "sample.ts");

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

  it("extracts snippet around single call site", () => {
    const snippets = extractSnippets(testFile, [5], { contextLines: 2 });

    expect(snippets).toHaveLength(1);
    const snippet = snippets[0];
    expect(snippet?.callSiteLine).toBe(5);
    expect(snippet?.startLine).toBe(3);
    expect(snippet?.endLine).toBe(7);
    expect(snippet?.code).toContain("transform(validated)");
  });

  it("extracts multiple snippets for different call sites", () => {
    const snippets = extractSnippets(testFile, [4, 12], { contextLines: 1 });

    expect(snippets).toHaveLength(2);
    expect(snippets[0]?.callSiteLine).toBe(4);
    expect(snippets[1]?.callSiteLine).toBe(12);
  });

  it("merges overlapping snippets", () => {
    // Lines 4, 5, 6 are close together - should merge into one snippet
    const snippets = extractSnippets(testFile, [4, 5, 6], { contextLines: 2 });

    expect(snippets).toHaveLength(1);
    const snippet = snippets[0];
    expect(snippet?.callSiteLine).toBe(4); // First call site
    expect(snippet?.startLine).toBe(2); // 4 - 2 context
    expect(snippet?.endLine).toBe(8); // 6 + 2 context
  });

  it("respects maxSnippets limit", () => {
    const snippets = extractSnippets(testFile, [4, 5, 12, 13], {
      contextLines: 0,
      maxSnippets: 2,
    });

    expect(snippets).toHaveLength(2);
  });

  it("truncates long snippets", () => {
    // Create a file with many lines
    const longFile = join(testDir, "long.ts");
    const longCode = Array.from(
      { length: 50 },
      (_, i) => `const line${i} = ${i};`,
    ).join("\n");
    writeFileSync(longFile, longCode);

    const snippets = extractSnippets(longFile, [25], {
      contextLines: 20,
      maxSnippetLines: 10,
    });

    expect(snippets).toHaveLength(1);
    const snippet = snippets[0];
    expect(snippet?.code).toContain("// ...");
    expect(snippet?.code).toContain("lines omitted");
  });

  it("returns empty array for non-existent file", () => {
    const snippets = extractSnippets("/non/existent/file.ts", [10]);

    expect(snippets).toEqual([]);
  });

  it("returns empty array for empty call sites", () => {
    const snippets = extractSnippets(testFile, []);

    expect(snippets).toEqual([]);
  });

  it("handles call site at start of file", () => {
    const snippets = extractSnippets(testFile, [1], { contextLines: 3 });

    expect(snippets).toHaveLength(1);
    const snippet = snippets[0];
    expect(snippet?.startLine).toBe(1); // Can't go before line 1
    expect(snippet?.endLine).toBe(4);
  });

  it("handles call site at end of file", () => {
    const lineCount = sampleCode.split("\n").length;
    const snippets = extractSnippets(testFile, [lineCount], {
      contextLines: 3,
    });

    expect(snippets).toHaveLength(1);
    expect(snippets[0]?.endLine).toBe(lineCount); // Can't go past last line
  });

  it("sorts call sites before processing", () => {
    // Pass unsorted call sites
    const snippets = extractSnippets(testFile, [12, 4], { contextLines: 0 });

    expect(snippets).toHaveLength(2);
    expect(snippets[0]?.callSiteLine).toBe(4); // First in sorted order
    expect(snippets[1]?.callSiteLine).toBe(12);
  });
});
