import { describe, expect, it } from "vitest";
import { computeContextLines } from "./computeContextLines.js";

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
