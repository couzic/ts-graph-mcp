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
      {
        source: "src/a.ts:Function:fnA",
        target: "src/b.ts:Function:fnB",
        type: "CALLS",
      },
      {
        source: "src/b.ts:Function:fnB",
        target: "src/c.ts:Function:fnC",
        type: "CALLS",
      },
    ]);

    expect(result.text).toBe("fnA --CALLS--> fnB --CALLS--> fnC");
    expect(result.nodeOrder).toEqual([
      "src/a.ts:Function:fnA",
      "src/b.ts:Function:fnB",
      "src/c.ts:Function:fnC",
    ]);
  });

  it("splits branches onto separate lines", () => {
    const result = formatGraph([
      {
        source: "src/a.ts:Function:root",
        target: "src/b.ts:Function:left",
        type: "CALLS",
      },
      {
        source: "src/a.ts:Function:root",
        target: "src/c.ts:Function:right",
        type: "CALLS",
      },
    ]);

    expect(result.text).toBe(`root --CALLS--> left
root --CALLS--> right`);
  });

  it("continues chain after branch", () => {
    const result = formatGraph([
      {
        source: "src/a.ts:Function:root",
        target: "src/b.ts:Function:left",
        type: "CALLS",
      },
      {
        source: "src/a.ts:Function:root",
        target: "src/c.ts:Function:right",
        type: "CALLS",
      },
      {
        source: "src/c.ts:Function:right",
        target: "src/d.ts:Function:rightChild",
        type: "CALLS",
      },
    ]);

    expect(result.text).toBe(`root --CALLS--> left
root --CALLS--> right --CALLS--> rightChild`);
  });

  it("disambiguates colliding names", () => {
    const result = formatGraph([
      {
        source: "src/a.ts:Function:format",
        target: "src/b.ts:Function:format",
        type: "CALLS",
      },
    ]);

    expect(result.text).toBe("format (a.ts) --CALLS--> format (b.ts)");
  });

  it("handles different edge types", () => {
    const result = formatGraph([
      {
        source: "src/a.ts:Class:Child",
        target: "src/b.ts:Class:Parent",
        type: "EXTENDS",
      },
      {
        source: "src/a.ts:Class:Child",
        target: "src/c.ts:Interface:IFace",
        type: "IMPLEMENTS",
      },
    ]);

    expect(result.text).toBe(`Child --EXTENDS--> Parent
Child --IMPLEMENTS--> IFace`);
  });

  it("includes all nodes in nodeOrder even when cycles exist alongside roots", () => {
    // Graph structure:
    // A -> B (linear chain, A is a root)
    // C -> D -> C (cycle - neither C nor D is a root since both have incoming edges)
    //
    // Bug: DFS only starts from roots (nodes with no incoming edges).
    // The cycle C <-> D has no root, so it's never visited.
    const result = formatGraph([
      {
        source: "src/a.ts:Function:fnA",
        target: "src/b.ts:Function:fnB",
        type: "CALLS",
      },
      {
        source: "src/c.ts:Function:fnC",
        target: "src/d.ts:Function:fnD",
        type: "CALLS",
      },
      {
        source: "src/d.ts:Function:fnD",
        target: "src/c.ts:Function:fnC",
        type: "CALLS",
      },
    ]);

    // All 4 nodes should be in nodeOrder
    const allNodes = new Set([
      "src/a.ts:Function:fnA",
      "src/b.ts:Function:fnB",
      "src/c.ts:Function:fnC",
      "src/d.ts:Function:fnD",
    ]);
    expect(result.nodeOrder.length).toBe(allNodes.size);
    expect(new Set(result.nodeOrder)).toEqual(allNodes);
  });
});
