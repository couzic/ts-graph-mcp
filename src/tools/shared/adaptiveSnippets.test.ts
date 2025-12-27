import { describe, expect, it } from "vitest";
import {
  computeContextLines,
  getAdaptiveMessage,
  MAX_NODES,
  NO_SNIPPET_THRESHOLD,
  shouldOmitSnippets,
  shouldTruncateNodes,
} from "./adaptiveSnippets.js";

describe(computeContextLines.name, () => {
  it("returns null for zero or negative counts", () => {
    expect(computeContextLines(0)).toBe(null);
    expect(computeContextLines(-1)).toBe(null);
  });

  it("returns 10 for 1-5 nodes (full context)", () => {
    expect(computeContextLines(1)).toBe(10);
    expect(computeContextLines(3)).toBe(10);
    expect(computeContextLines(5)).toBe(10);
  });

  it("returns scaled value for 6-25 nodes", () => {
    // floor((25-x)/2)
    expect(computeContextLines(6)).toBe(9); // floor((25-6)/2) = 9
    expect(computeContextLines(10)).toBe(7); // floor((25-10)/2) = 7
    expect(computeContextLines(15)).toBe(5); // floor((25-15)/2) = 5
    expect(computeContextLines(20)).toBe(2); // floor((25-20)/2) = 2
    expect(computeContextLines(25)).toBe(0); // floor((25-25)/2) = 0
  });

  it("returns 0 for 26-35 nodes (call site only)", () => {
    expect(computeContextLines(26)).toBe(0);
    expect(computeContextLines(30)).toBe(0);
    expect(computeContextLines(35)).toBe(0);
  });

  it("returns null for 36+ nodes (no snippets)", () => {
    expect(computeContextLines(36)).toBe(null);
    expect(computeContextLines(40)).toBe(null);
    expect(computeContextLines(50)).toBe(null);
    expect(computeContextLines(100)).toBe(null);
  });
});

describe(shouldTruncateNodes.name, () => {
  it("returns false for counts at or below MAX_NODES", () => {
    expect(shouldTruncateNodes(1)).toBe(false);
    expect(shouldTruncateNodes(MAX_NODES)).toBe(false);
  });

  it("returns true for counts above MAX_NODES", () => {
    expect(shouldTruncateNodes(MAX_NODES + 1)).toBe(true);
    expect(shouldTruncateNodes(100)).toBe(true);
  });
});

describe(shouldOmitSnippets.name, () => {
  it("returns false for counts at or below NO_SNIPPET_THRESHOLD", () => {
    expect(shouldOmitSnippets(1)).toBe(false);
    expect(shouldOmitSnippets(NO_SNIPPET_THRESHOLD)).toBe(false);
  });

  it("returns true for counts above NO_SNIPPET_THRESHOLD", () => {
    expect(shouldOmitSnippets(NO_SNIPPET_THRESHOLD + 1)).toBe(true);
    expect(shouldOmitSnippets(50)).toBe(true);
  });
});

describe(getAdaptiveMessage.name, () => {
  it("returns undefined for small counts", () => {
    expect(getAdaptiveMessage(1)).toBeUndefined();
    expect(getAdaptiveMessage(35)).toBeUndefined();
  });

  it("returns snippet omission message for 36-50 nodes", () => {
    const message = getAdaptiveMessage(40);
    expect(message).toContain("Snippets omitted");
    expect(message).toContain("40 nodes");
    expect(message).toContain("Read tool");
  });

  it("returns truncation message for 50+ nodes", () => {
    const message = getAdaptiveMessage(60);
    expect(message).toContain("truncated");
    expect(message).toContain("50 nodes");
    expect(message).toContain("Refine query");
  });
});
