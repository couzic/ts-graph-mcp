import { describe, expect, it } from "vitest";
import { collectNodeIds } from "./collectNodeIds.js";
import type { GraphEdge } from "./GraphTypes.js";

describe(collectNodeIds.name, () => {
  it("collects unique source and target IDs", () => {
    const edges: GraphEdge[] = [
      { source: "a.ts:foo", target: "b.ts:bar", type: "CALLS" },
      { source: "b.ts:bar", target: "c.ts:baz", type: "CALLS" },
    ];

    const ids = collectNodeIds(edges);

    expect(ids).toContain("a.ts:foo");
    expect(ids).toContain("b.ts:bar");
    expect(ids).toContain("c.ts:baz");
    expect(ids).toHaveLength(3);
  });

  it("collects all nodes without filtering", () => {
    const edges: GraphEdge[] = [
      { source: "a.ts:foo", target: "b.ts:bar", type: "CALLS" },
    ];

    const ids = collectNodeIds(edges);

    expect(ids).toContain("a.ts:foo");
    expect(ids).toContain("b.ts:bar");
    expect(ids).toHaveLength(2);
  });

  it("deduplicates IDs appearing in multiple edges", () => {
    const edges: GraphEdge[] = [
      { source: "a.ts:foo", target: "b.ts:bar", type: "CALLS" },
      { source: "a.ts:foo", target: "c.ts:baz", type: "CALLS" },
    ];

    const ids = collectNodeIds(edges);

    expect(ids.filter((id) => id === "a.ts:foo")).toHaveLength(1);
  });

  it("returns empty array for empty edges", () => {
    const ids = collectNodeIds([]);
    expect(ids).toEqual([]);
  });
});
