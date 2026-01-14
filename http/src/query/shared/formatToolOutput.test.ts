import { describe, expect, it } from "vitest";
import type { GraphEdge } from "./GraphTypes.js";
import type { FormatInput } from "./formatToolOutput.js";
import { formatToolOutput, truncateEdges } from "./formatToolOutput.js";

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
        maxNodes: 2, // Only 2 nodes allowed, but graph has 4
      };

      const result = formatToolOutput(input);

      expect(result).toContain("## Graph");
      expect(result).not.toContain("## Nodes");
      expect(result).toContain("(2/4 nodes displayed. Nodes section skipped. Use max_nodes param for full output.)");
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
        maxNodes: 3, // Should keep A, B, C
      };

      const result = formatToolOutput(input);

      expect(result).toContain("fnA");
      expect(result).toContain("fnB");
      expect(result).toContain("fnC");
      // D and E should not appear in the truncated graph
      expect(result).not.toContain("fnD");
      expect(result).not.toContain("fnE");
      expect(result).toContain("(3/5 nodes displayed. Nodes section skipped. Use max_nodes param for full output.)");
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
        // No maxNodes specified - should use default of 50
      };

      const result = formatToolOutput(input);

      // 51 nodes > 50 default, so should be truncated
      expect(result).not.toContain("## Nodes");
      expect(result).toContain("(50/51 nodes displayed. Nodes section skipped. Use max_nodes param for full output.)");
    });

  });

  describe("snippet threshold", () => {
    it("includes snippets when node count is at or below 30", () => {
      // Create a graph with exactly 30 nodes
      const edges = [];
      for (let i = 0; i < 29; i++) {
        edges.push({
          source: `src/fn${i}.ts:fn${i}`,
          target: `src/fn${i + 1}.ts:fn${i + 1}`,
          type: "CALLS" as const,
        });
      }

      const nodes = [
        {
          id: "src/fn1.ts:fn1",
          name: "fn1",
          type: "Function" as const,
          filePath: "src/fn1.ts",
          startLine: 1,
          endLine: 3,
          locs: [
            { line: 1, code: "function fn1() {" },
            { line: 2, code: "  return fn2();" },
            { line: 3, code: "}" },
          ],
        },
      ];

      const input: FormatInput = {
        edges,
        nodes,
      };

      const result = formatToolOutput(input);

      // 30 nodes should include snippets
      expect(result).toContain("## Nodes");
      expect(result).toContain("snippet:");
      expect(result).toContain("function fn1()");
    });

    it("omits snippets but shows node metadata when node count exceeds 30", () => {
      // Create a graph with exactly 31 nodes
      const edges = [];
      for (let i = 0; i < 30; i++) {
        edges.push({
          source: `src/fn${i}.ts:fn${i}`,
          target: `src/fn${i + 1}.ts:fn${i + 1}`,
          type: "CALLS" as const,
        });
      }

      const nodes = [
        {
          id: "src/fn1.ts:fn1",
          name: "fn1",
          type: "Function" as const,
          filePath: "src/fn1.ts",
          startLine: 1,
          endLine: 3,
          locs: [
            { line: 1, code: "function fn1() {" },
            { line: 2, code: "  return fn2();" },
            { line: 3, code: "}" },
          ],
        },
      ];

      const input: FormatInput = {
        edges,
        nodes,
      };

      const result = formatToolOutput(input);

      // 31 nodes should show Nodes section but omit snippets
      expect(result).toContain("## Nodes");
      expect(result).toContain("fn1:");
      expect(result).toContain("type: Function");
      expect(result).toContain("file: src/fn1.ts");
      expect(result).toContain("offset: 1, limit: 3");
      // Snippets should NOT be included
      expect(result).not.toContain("snippet:");
      expect(result).not.toContain("function fn1()");
    });

    it("omits snippets at 40 nodes (between snippet and maxNodes thresholds)", () => {
      // Create a graph with exactly 40 nodes
      const edges = [];
      for (let i = 0; i < 39; i++) {
        edges.push({
          source: `src/fn${i}.ts:fn${i}`,
          target: `src/fn${i + 1}.ts:fn${i + 1}`,
          type: "CALLS" as const,
        });
      }

      const nodes = [
        {
          id: "src/fn1.ts:fn1",
          name: "fn1",
          type: "Function" as const,
          filePath: "src/fn1.ts",
          startLine: 1,
          endLine: 3,
          locs: [
            { line: 1, code: "function fn1() {" },
            { line: 2, code: "  return fn2();" },
            { line: 3, code: "}" },
          ],
        },
      ];

      const input: FormatInput = {
        edges,
        nodes,
      };

      const result = formatToolOutput(input);

      // 40 nodes: under maxNodes (50) so Nodes section shown,
      // but over snippet threshold (30) so no snippets
      expect(result).toContain("## Nodes");
      expect(result).toContain("fn1:");
      expect(result).not.toContain("snippet:");
    });
  });
});

describe("truncateEdges", () => {
  it("returns all edges when node count is within maxNodes", () => {
    const edges: GraphEdge[] = [
      { source: "src/a.ts:fnA", target: "src/b.ts:fnB", type: "CALLS" },
      { source: "src/b.ts:fnB", target: "src/c.ts:fnC", type: "CALLS" },
    ];

    const result = truncateEdges(edges, 10);

    expect(result.truncatedEdges).toEqual(edges);
    expect(result.totalNodeCount).toBe(3);
  });

  it("truncates edges to first maxNodes in traversal order", () => {
    // Chain: A -> B -> C -> D -> E
    const edges: GraphEdge[] = [
      { source: "src/a.ts:fnA", target: "src/b.ts:fnB", type: "CALLS" },
      { source: "src/b.ts:fnB", target: "src/c.ts:fnC", type: "CALLS" },
      { source: "src/c.ts:fnC", target: "src/d.ts:fnD", type: "CALLS" },
      { source: "src/d.ts:fnD", target: "src/e.ts:fnE", type: "CALLS" },
    ];

    const result = truncateEdges(edges, 3);

    // Should only include edges where BOTH nodes are in first 3 (A, B, C)
    expect(result.truncatedEdges).toEqual([
      { source: "src/a.ts:fnA", target: "src/b.ts:fnB", type: "CALLS" },
      { source: "src/b.ts:fnB", target: "src/c.ts:fnC", type: "CALLS" },
    ]);
    expect(result.totalNodeCount).toBe(5);
  });

  it("handles branching graphs", () => {
    // Tree: A -> B, A -> C, B -> D
    const edges: GraphEdge[] = [
      { source: "src/a.ts:fnA", target: "src/b.ts:fnB", type: "CALLS" },
      { source: "src/a.ts:fnA", target: "src/c.ts:fnC", type: "CALLS" },
      { source: "src/b.ts:fnB", target: "src/d.ts:fnD", type: "CALLS" },
    ];

    const result = truncateEdges(edges, 3);

    // Traversal order depends on formatGraph, but should keep first 3 nodes
    expect(result.totalNodeCount).toBe(4);
    expect(result.truncatedEdges.length).toBeLessThanOrEqual(edges.length);
  });
});
