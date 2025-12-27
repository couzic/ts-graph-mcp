import { describe, expect, it } from "vitest";
import {
  extractSymbol,
  formatLines,
  formatLocation,
} from "./nodeFormatters.js";

describe(extractSymbol.name, () => {
  it("extracts symbol from standard node ID", () => {
    expect(extractSymbol("src/db/Types.ts:BaseNode")).toBe("BaseNode");
  });

  it("extracts nested symbol from node ID", () => {
    expect(extractSymbol("src/db/Types.ts:BaseNode.id")).toBe("BaseNode.id");
  });

  it("returns input as-is when no colon present", () => {
    expect(extractSymbol("justAName")).toBe("justAName");
  });

  it("returns file path when node ID has no symbol part", () => {
    expect(extractSymbol("src/db/Types.ts")).toBe("src/db/Types.ts");
  });

  it("handles multiple colons by using first occurrence", () => {
    expect(extractSymbol("src/db/Types.ts:Namespace:Symbol")).toBe(
      "Namespace:Symbol",
    );
  });

  it("handles empty string after colon", () => {
    expect(extractSymbol("src/db/Types.ts:")).toBe("");
  });

  it("handles empty string input", () => {
    expect(extractSymbol("")).toBe("");
  });
});

describe(formatLines.name, () => {
  it("formats same line as single number", () => {
    expect(formatLines(26, 26)).toBe("26");
  });

  it("formats line range with dash separator", () => {
    expect(formatLines(24, 51)).toBe("24-51");
  });

  it("handles single-digit line numbers", () => {
    expect(formatLines(1, 5)).toBe("1-5");
  });

  it("handles large line numbers", () => {
    expect(formatLines(1000, 2000)).toBe("1000-2000");
  });

  it("formats line 1 correctly", () => {
    expect(formatLines(1, 1)).toBe("1");
  });
});

describe(formatLocation.name, () => {
  it("returns offset and limit for single line", () => {
    const result = formatLocation({ startLine: 26, endLine: 26 });
    expect(result).toEqual({ offset: 26, limit: 1 });
  });

  it("returns offset and limit for line range", () => {
    const result = formatLocation({ startLine: 24, endLine: 51 });
    expect(result).toEqual({ offset: 24, limit: 28 });
  });

  it("handles line 1", () => {
    const result = formatLocation({ startLine: 1, endLine: 1 });
    expect(result).toEqual({ offset: 1, limit: 1 });
  });

  it("handles large line numbers", () => {
    const result = formatLocation({ startLine: 1000, endLine: 2000 });
    expect(result).toEqual({ offset: 1000, limit: 1001 });
  });

  it("calculates limit correctly for multi-line range", () => {
    const result = formatLocation({ startLine: 15, endLine: 20 });
    expect(result).toEqual({ offset: 15, limit: 6 });
  });
});
