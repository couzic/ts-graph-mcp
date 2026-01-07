import { describe, expect, it } from "vitest";
import { levenshteinDistance } from "./levenshteinDistance.js";

describe("levenshteinDistance", () => {
  it("returns 0 for identical strings", () => {
    expect(levenshteinDistance("hello", "hello")).toBe(0);
  });

  it("returns length of non-empty string when other is empty", () => {
    expect(levenshteinDistance("", "hello")).toBe(5);
    expect(levenshteinDistance("hello", "")).toBe(5);
  });

  it("returns 0 for two empty strings", () => {
    expect(levenshteinDistance("", "")).toBe(0);
  });

  it("returns 1 for single character difference", () => {
    expect(levenshteinDistance("cat", "bat")).toBe(1);
    expect(levenshteinDistance("cat", "car")).toBe(1);
    expect(levenshteinDistance("cat", "cats")).toBe(1);
  });

  it("computes classic example kitten->sitting = 3", () => {
    expect(levenshteinDistance("kitten", "sitting")).toBe(3);
  });

  it("is case-insensitive", () => {
    expect(levenshteinDistance("Hello", "hello")).toBe(0);
    expect(levenshteinDistance("HELLO", "hello")).toBe(0);
    expect(levenshteinDistance("formatDate", "formatdate")).toBe(0);
  });

  it("handles file paths", () => {
    expect(levenshteinDistance("src/util/date.ts", "src/utils/date.ts")).toBe(
      1,
    );
    expect(levenshteinDistance("src/util/date.ts", "libs/date.ts")).toBe(8);
  });

  it("handles symbol names", () => {
    expect(levenshteinDistance("formatdate", "formatDate")).toBe(0);
    expect(levenshteinDistance("formatDate", "parseDate")).toBe(5);
  });
});
