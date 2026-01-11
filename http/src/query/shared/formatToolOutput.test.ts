import { describe, expect, it } from "vitest";
import type { FormatInput } from "./formatToolOutput.js";
import { formatToolOutput } from "./formatToolOutput.js";

describe("formatToolOutput", () => {
  it("formats a simple call chain with node snippets", () => {
    const input: FormatInput = {
      edges: [
        {
          source: "src/a.ts:fnA",
          target: "src/b.ts:fnB",
          type: "CALLS",
        },
        {
          source: "src/b.ts:fnB",
          target: "src/c.ts:fnC",
          type: "CALLS",
          callSites: [{ start: 2, end: 2 }],
        },
      ],
      nodes: [
        {
          id: "src/b.ts:fnB",
          name: "fnB",
          type: "Function",
          filePath: "src/b.ts",
          startLine: 1,
          endLine: 3,
          locs: [
            { line: 1, code: "function fnB() {" },
            { line: 2, code: "  return fnC();" },
            { line: 3, code: "}" },
          ],
        },
      ],
      excludeNodeIds: new Set(["src/a.ts:fnA", "src/c.ts:fnC"]),
    };

    const result = formatToolOutput(input);

    expect(result).toBe(`## Graph

fnA --CALLS--> fnB --CALLS--> fnC

## Nodes

fnB:
  type: Function
  file: src/b.ts
  offset: 1, limit: 3
  snippet:
    1: function fnB() {
  > 2:   return fnC();
    3: }
`);
  });

  it("supports empty nodes", () => {
    const input: FormatInput = {
      edges: [
        { source: "src/a.ts:fnA", target: "src/b.ts:fnB", type: "CALLS" },
      ],
      nodes: [],
      excludeNodeIds: new Set(["src/a.ts:fnA", "src/b.ts:fnB"]),
    };

    const result = formatToolOutput(input);

    expect(result).toBe(`## Graph

fnA --CALLS--> fnB`);
  });

  describe("maxNodes truncation", () => {
    it("shows full output when node count is under maxNodes", () => {
      const input: FormatInput = {
        edges: [
          { source: "src/a.ts:fnA", target: "src/b.ts:fnB", type: "CALLS" },
          { source: "src/b.ts:fnB", target: "src/c.ts:fnC", type: "CALLS" },
        ],
        nodes: [
          {
            id: "src/b.ts:fnB",
            name: "fnB",
            type: "Function",
            filePath: "src/b.ts",
            startLine: 1,
            endLine: 1,
            locs: [{ line: 1, code: "function fnB() {}" }],
          },
        ],
        excludeNodeIds: new Set(["src/a.ts:fnA", "src/c.ts:fnC"]),
        maxNodes: 5,
      };

      const result = formatToolOutput(input);

      expect(result).toContain("## Graph");
      expect(result).toContain("## Nodes");
      expect(result).toContain("fnB:");
    });

    it("shows full output when node count equals maxNodes", () => {
      const input: FormatInput = {
        edges: [
          { source: "src/a.ts:fnA", target: "src/b.ts:fnB", type: "CALLS" },
          { source: "src/b.ts:fnB", target: "src/c.ts:fnC", type: "CALLS" },
        ],
        nodes: [
          {
            id: "src/b.ts:fnB",
            name: "fnB",
            type: "Function",
            filePath: "src/b.ts",
            startLine: 1,
            endLine: 1,
            locs: [{ line: 1, code: "function fnB() {}" }],
          },
        ],
        excludeNodeIds: new Set(["src/a.ts:fnA", "src/c.ts:fnC"]),
        maxNodes: 3, // Exactly 3 nodes: fnA, fnB, fnC
      };

      const result = formatToolOutput(input);

      expect(result).toContain("## Graph");
      expect(result).toContain("## Nodes");
    });

    it("skips Nodes section when node count exceeds maxNodes", () => {
      const input: FormatInput = {
        edges: [
          { source: "src/a.ts:fnA", target: "src/b.ts:fnB", type: "CALLS" },
          { source: "src/b.ts:fnB", target: "src/c.ts:fnC", type: "CALLS" },
          { source: "src/c.ts:fnC", target: "src/d.ts:fnD", type: "CALLS" },
        ],
        nodes: [],
        excludeNodeIds: new Set(),
        maxNodes: 2, // Only 2 nodes allowed, but graph has 4
      };

      const result = formatToolOutput(input);

      expect(result).toContain("## Graph");
      expect(result).not.toContain("## Nodes");
      expect(result).toContain("4 nodes total");
      expect(result).toContain("Nodes section skipped");
    });

    it("truncates graph to first maxNodes nodes in traversal order", () => {
      // Graph: A -> B -> C -> D -> E (5 nodes, linear chain)
      const input: FormatInput = {
        edges: [
          { source: "src/a.ts:fnA", target: "src/b.ts:fnB", type: "CALLS" },
          { source: "src/b.ts:fnB", target: "src/c.ts:fnC", type: "CALLS" },
          { source: "src/c.ts:fnC", target: "src/d.ts:fnD", type: "CALLS" },
          { source: "src/d.ts:fnD", target: "src/e.ts:fnE", type: "CALLS" },
        ],
        nodes: [],
        excludeNodeIds: new Set(),
        maxNodes: 3, // Should keep A, B, C
      };

      const result = formatToolOutput(input);

      expect(result).toContain("fnA");
      expect(result).toContain("fnB");
      expect(result).toContain("fnC");
      // D and E should not appear in the truncated graph
      expect(result).not.toContain("fnD");
      expect(result).not.toContain("fnE");
      expect(result).toContain("5 nodes total");
    });

    it("uses default maxNodes of 50 when not specified", () => {
      // Create a graph with exactly 51 nodes
      const edges = [];
      for (let i = 0; i < 50; i++) {
        edges.push({
          source: `src/fn${i}.ts:fn${i}`,
          target: `src/fn${i + 1}.ts:fn${i + 1}`,
          type: "CALLS" as const,
        });
      }

      const input: FormatInput = {
        edges,
        nodes: [],
        excludeNodeIds: new Set(),
        // No maxNodes specified - should use default of 50
      };

      const result = formatToolOutput(input);

      // 51 nodes > 50 default, so should be truncated
      expect(result).not.toContain("## Nodes");
      expect(result).toContain("51 nodes total");
    });
  });
});
