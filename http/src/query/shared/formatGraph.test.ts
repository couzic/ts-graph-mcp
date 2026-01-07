import { describe, expect, it } from "vitest";
import { formatGraph } from "./formatGraph.js";

describe(formatGraph.name, () => {
  it("supports empty edges", () => {
    const result = formatGraph([]);

    expect(result.text).toBe("");
    expect(result.nodeOrder).toEqual([]);
  });

  it("formats linear chain on single line", () => {
    const result = formatGraph([
      { source: "src/a.ts:fnA", target: "src/b.ts:fnB", type: "CALLS" },
      { source: "src/b.ts:fnB", target: "src/c.ts:fnC", type: "CALLS" },
    ]);

    expect(result.text).toBe("fnA --CALLS--> fnB --CALLS--> fnC");
    expect(result.nodeOrder).toEqual([
      "src/a.ts:fnA",
      "src/b.ts:fnB",
      "src/c.ts:fnC",
    ]);
  });

  it("splits branches onto separate lines", () => {
    const result = formatGraph([
      { source: "src/a.ts:root", target: "src/b.ts:left", type: "CALLS" },
      { source: "src/a.ts:root", target: "src/c.ts:right", type: "CALLS" },
    ]);

    expect(result.text).toBe(`root --CALLS--> left
root --CALLS--> right`);
  });

  it("continues chain after branch", () => {
    const result = formatGraph([
      { source: "src/a.ts:root", target: "src/b.ts:left", type: "CALLS" },
      { source: "src/a.ts:root", target: "src/c.ts:right", type: "CALLS" },
      {
        source: "src/c.ts:right",
        target: "src/d.ts:rightChild",
        type: "CALLS",
      },
    ]);

    expect(result.text).toBe(`root --CALLS--> left
root --CALLS--> right --CALLS--> rightChild`);
  });

  it("disambiguates colliding names", () => {
    const result = formatGraph([
      { source: "src/a.ts:format", target: "src/b.ts:format", type: "CALLS" },
    ]);

    expect(result.text).toBe("format#1 --CALLS--> format#2");
  });

  it("handles different edge types", () => {
    const result = formatGraph([
      { source: "src/a.ts:Child", target: "src/b.ts:Parent", type: "EXTENDS" },
      {
        source: "src/a.ts:Child",
        target: "src/c.ts:IFace",
        type: "IMPLEMENTS",
      },
    ]);

    expect(result.text).toBe(`Child --EXTENDS--> Parent
Child --IMPLEMENTS--> IFace`);
  });
});
