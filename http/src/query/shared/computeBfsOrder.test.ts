import { describe, expect, it } from "vitest";
import type { EdgeType } from "@ts-graph/shared";
import { computeBfsOrder } from "./computeBfsOrder.js";

const edge = (source: string, target: string): { source: string; target: string; type: EdgeType } => ({
  source,
  target,
  type: "CALLS",
});

/** @spec tool::output.truncation */
describe("computeBfsOrder", () => {
  it("returns empty array for empty edges", () => {
    expect(computeBfsOrder([])).toEqual([]);
  });

  it("returns linear chain in order", () => {
    const edges = [edge("A", "B"), edge("B", "C")];
    expect(computeBfsOrder(edges)).toEqual(["A", "B", "C"]);
  });

  it("visits siblings before descendants (branching)", () => {
    const edges = [edge("A", "B"), edge("A", "C"), edge("B", "D")];
    expect(computeBfsOrder(edges)).toEqual(["A", "B", "C", "D"]);
  });

  it("visits direct children before deep descendants", () => {
    // A -> B, A -> C, A -> D, B -> E, E -> F, F -> G
    const edges = [
      edge("A", "B"),
      edge("A", "C"),
      edge("A", "D"),
      edge("B", "E"),
      edge("E", "F"),
      edge("F", "G"),
    ];
    const order = computeBfsOrder(edges);
    // A's direct children (B, C, D) must all appear before B's descendants (E, F, G)
    expect(order.indexOf("C")).toBeLessThan(order.indexOf("E"));
    expect(order.indexOf("D")).toBeLessThan(order.indexOf("E"));
    expect(order).toEqual(["A", "B", "C", "D", "E", "F", "G"]);
  });

  it("visits converging callers before deeper nodes", () => {
    // A -> C, B -> C, C -> D (backward traversal shape)
    const edges = [edge("A", "C"), edge("B", "C"), edge("C", "D")];
    const order = computeBfsOrder(edges);
    // A and B are roots, visited before C and D
    expect(order.indexOf("A")).toBeLessThan(order.indexOf("C"));
    expect(order.indexOf("B")).toBeLessThan(order.indexOf("C"));
    expect(order.indexOf("C")).toBeLessThan(order.indexOf("D"));
  });

  it("handles disconnected components", () => {
    const edges = [edge("A", "B"), edge("C", "D")];
    const order = computeBfsOrder(edges);
    expect(order).toHaveLength(4);
    // Both roots visited, then their targets
    expect(order.indexOf("A")).toBeLessThan(order.indexOf("B"));
    expect(order.indexOf("C")).toBeLessThan(order.indexOf("D"));
  });

  it("handles cycles", () => {
    const edges = [edge("A", "B"), edge("B", "A")];
    const order = computeBfsOrder(edges);
    expect(order).toHaveLength(2);
    expect(order).toContain("A");
    expect(order).toContain("B");
  });

  it("handles multiple roots", () => {
    const edges = [edge("A", "C"), edge("B", "C")];
    const order = computeBfsOrder(edges);
    expect(order).toEqual(["A", "B", "C"]);
  });
});
