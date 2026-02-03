import { describe, expect, it } from "vitest";
import { formatNodes } from "./formatNodes.js";
import type { NodeInfo } from "./GraphTypes.js";

describe(formatNodes.name, () => {
  it("formats nodes with file location and snippet", () => {
    const nodes: NodeInfo[] = [
      {
        id: "src/a.ts:Function:fnA",
        name: "fnA",
        type: "Function",
        filePath: "src/fnA.ts",
        startLine: 1,
        endLine: 5,
        locs: [
          { line: 1, code: "function fnA() {" },
          { line: 2, code: "  return 42;" },
          { line: 3, code: "}" },
        ],
      },
    ];
    const displayNames = new Map([["src/a.ts:Function:fnA", "fnA"]]);

    const result = formatNodes(nodes, displayNames, new Set());

    expect(result.text).toBe(`fnA:
  type: Function
  file: src/fnA.ts
  offset: 1, limit: 5
  snippet:
    1: function fnA() {
    2:   return 42;
    3: }
`);
    expect(result.nodeOrder).toEqual(["src/a.ts:Function:fnA"]);
  });

  it("marks call site lines with > prefix", () => {
    const nodes: NodeInfo[] = [
      {
        id: "src/a.ts:Function:fnA",
        name: "fnA",
        type: "Function",
        filePath: "src/fnA.ts",
        startLine: 1,
        endLine: 5,
        locs: [
          { line: 1, code: "function fnA() {" },
          { line: 2, code: "  callTarget();" },
          { line: 3, code: "}" },
        ],
        callSites: [{ start: 2, end: 2 }],
      },
    ];
    const displayNames = new Map([["src/a.ts:Function:fnA", "fnA"]]);

    const result = formatNodes(nodes, displayNames, new Set());

    expect(result.text).toContain("  > 2:   callTarget();");
  });

  it("shows gap markers between non-adjacent lines", () => {
    const nodes: NodeInfo[] = [
      {
        id: "src/a.ts:Function:fnA",
        name: "fnA",
        type: "Function",
        filePath: "src/fnA.ts",
        startLine: 1,
        endLine: 10,
        locs: [
          { line: 1, code: "function fnA() {" },
          { line: 10, code: "  return 42;" },
        ],
      },
    ];
    const displayNames = new Map([["src/a.ts:Function:fnA", "fnA"]]);

    const result = formatNodes(nodes, displayNames, new Set());

    expect(result.text).toContain("... 8 lines omitted ...");
  });

  it("excludes nodes in excludeIds", () => {
    const nodes: NodeInfo[] = [
      {
        id: "src/a.ts:Function:fnA",
        name: "fnA",
        type: "Function",
        filePath: "src/fnA.ts",
        startLine: 1,
        endLine: 5,
      },
      {
        id: "src/b.ts:Function:fnB",
        name: "fnB",
        type: "Function",
        filePath: "src/fnB.ts",
        startLine: 1,
        endLine: 5,
      },
    ];
    const displayNames = new Map([
      ["src/a.ts:Function:fnA", "fnA"],
      ["src/b.ts:Function:fnB", "fnB"],
    ]);

    const result = formatNodes(
      nodes,
      displayNames,
      new Set(["src/a.ts:Function:fnA"]),
    );

    expect(result.text).toContain("fnB:");
    expect(result.text).not.toContain("fnA:");
  });

  it("orders by nodeOrder when provided", () => {
    const nodes: NodeInfo[] = [
      {
        id: "src/a.ts:Function:fnA",
        name: "fnA",
        type: "Function",
        filePath: "src/fnA.ts",
        startLine: 1,
        endLine: 5,
      },
      {
        id: "src/b.ts:Function:fnB",
        name: "fnB",
        type: "Function",
        filePath: "src/fnB.ts",
        startLine: 1,
        endLine: 5,
      },
      {
        id: "src/c.ts:Function:fnC",
        name: "fnC",
        type: "Function",
        filePath: "src/fnC.ts",
        startLine: 1,
        endLine: 5,
      },
    ];
    const displayNames = new Map([
      ["src/a.ts:Function:fnA", "fnA"],
      ["src/b.ts:Function:fnB", "fnB"],
      ["src/c.ts:Function:fnC", "fnC"],
    ]);
    const nodeOrder = [
      "src/c.ts:Function:fnC",
      "src/a.ts:Function:fnA",
      "src/b.ts:Function:fnB",
    ];

    const result = formatNodes(nodes, displayNames, new Set(), nodeOrder);

    expect(result.nodeOrder).toEqual([
      "src/c.ts:Function:fnC",
      "src/a.ts:Function:fnA",
      "src/b.ts:Function:fnB",
    ]);
  });

  it("returns empty for no included nodes", () => {
    const nodes: NodeInfo[] = [
      {
        id: "src/a.ts:Function:fnA",
        name: "fnA",
        type: "Function",
        filePath: "src/fnA.ts",
        startLine: 1,
        endLine: 5,
      },
    ];
    const displayNames = new Map([["src/a.ts:Function:fnA", "fnA"]]);

    const result = formatNodes(
      nodes,
      displayNames,
      new Set(["src/a.ts:Function:fnA"]),
    );

    expect(result.text).toBe("");
    expect(result.nodeOrder).toEqual([]);
  });
});
