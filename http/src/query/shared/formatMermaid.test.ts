import { describe, expect, it } from "vitest";
import { formatMermaid } from "./formatMermaid.js";
import type { GraphEdge } from "./GraphTypes.js";

describe("formatMermaid", () => {
  it("returns empty state for no edges", () => {
    const result = formatMermaid([]);

    const expected = `graph LR
  empty[No data]`;

    expect(result).toBe(expected);
  });

  it("formats a single edge", () => {
    const edges: GraphEdge[] = [
      { source: "src/a.ts:fnA", target: "src/b.ts:fnB", type: "CALLS" },
    ];

    const result = formatMermaid(edges);

    const expected = `graph LR
  fnA_0["fnA"]
  fnB_1["fnB"]
  fnA_0 -->|CALLS| fnB_1`;

    expect(result).toBe(expected);
  });

  it("formats multiple edges in a chain", () => {
    const edges: GraphEdge[] = [
      { source: "src/a.ts:fnA", target: "src/b.ts:fnB", type: "CALLS" },
      { source: "src/b.ts:fnB", target: "src/c.ts:fnC", type: "CALLS" },
    ];

    const result = formatMermaid(edges);

    const expected = `graph LR
  fnA_0["fnA"]
  fnB_1["fnB"]
  fnC_2["fnC"]
  fnA_0 -->|CALLS| fnB_1
  fnB_1 -->|CALLS| fnC_2`;

    expect(result).toBe(expected);
  });

  it("formats different edge types", () => {
    const edges: GraphEdge[] = [
      { source: "src/a.ts:fnA", target: "src/b.ts:fnB", type: "CALLS" },
      { source: "src/a.ts:fnA", target: "src/c.ts:fnC", type: "REFERENCES" },
    ];

    const result = formatMermaid(edges);

    const expected = `graph LR
  fnA_0["fnA"]
  fnB_1["fnB"]
  fnC_2["fnC"]
  fnA_0 -->|CALLS| fnB_1
  fnA_0 -->|REFERENCES| fnC_2`;

    expect(result).toBe(expected);
  });

  it("handles method names with dot notation", () => {
    const edges: GraphEdge[] = [
      {
        source: "src/service.ts:UserService.save",
        target: "src/db.ts:db.insert",
        type: "CALLS",
      },
    ];

    const result = formatMermaid(edges);

    const expected = `graph LR
  UserService_save_0["UserService.save"]
  db_insert_1["db.insert"]
  UserService_save_0 -->|CALLS| db_insert_1`;

    expect(result).toBe(expected);
  });

  describe("maxNodes truncation", () => {
    it("truncates graph when node count exceeds maxNodes", () => {
      // Create a chain: A -> B -> C -> D -> E (5 nodes)
      const edges: GraphEdge[] = [
        { source: "src/a.ts:fnA", target: "src/b.ts:fnB", type: "CALLS" },
        { source: "src/b.ts:fnB", target: "src/c.ts:fnC", type: "CALLS" },
        { source: "src/c.ts:fnC", target: "src/d.ts:fnD", type: "CALLS" },
        { source: "src/d.ts:fnD", target: "src/e.ts:fnE", type: "CALLS" },
      ];

      const result = formatMermaid(edges, { maxNodes: 3 });

      // Should only include first 3 nodes (A, B, C) and edges between them
      expect(result).toContain("fnA");
      expect(result).toContain("fnB");
      expect(result).toContain("fnC");
      expect(result).not.toContain("fnD");
      expect(result).not.toContain("fnE");
      // Should include truncation comment
      expect(result).toContain("%% (3/5 nodes displayed)");
    });

    it("does not truncate when node count is within maxNodes", () => {
      const edges: GraphEdge[] = [
        { source: "src/a.ts:fnA", target: "src/b.ts:fnB", type: "CALLS" },
        { source: "src/b.ts:fnB", target: "src/c.ts:fnC", type: "CALLS" },
      ];

      const result = formatMermaid(edges, { maxNodes: 10 });

      // All nodes should be present
      expect(result).toContain("fnA");
      expect(result).toContain("fnB");
      expect(result).toContain("fnC");
      // No truncation message
      expect(result).not.toContain("%%");
    });
  });
});
